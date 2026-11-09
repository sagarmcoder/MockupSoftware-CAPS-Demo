import {createReadStream} from "node:fs";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
import {basename} from "node:path";

function matchPath(template, pathname){
  const expected=template.split("/").filter(Boolean);
  const actual=pathname.split("/").filter(Boolean);
  if(expected.length!==actual.length) return null;
  const params={};
  for(let index=0;index<expected.length;index+=1){
    const segment=expected[index];
    const value=actual[index];
    if(segment.startsWith(":")) params[segment.slice(1)]=decodeURIComponent(value);
    else if(segment!==value) return null;
  }
  return params;
}

function createResponse(response){
  return {
    status(code){
      response.statusCode=code;
      return this;
    },
    setHeader(name,value){
      response.setHeader(name,value);
      return this;
    },
    set(name,value){
      response.setHeader(name,value);
      return this;
    },
    flushHeaders(){
      response.flushHeaders();
      return this;
    },
    write(chunk){
      response.write(chunk);
      return this;
    },
    on(event,handler){
      response.on(event,handler);
      return this;
    },
    json(payload){
      if(!response.headersSent) response.setHeader("Content-Type","application/json; charset=utf-8");
      response.end(JSON.stringify(payload));
    },
    sendFile(filePath,options={}){
      for(const [name,value] of Object.entries(options.headers||{})) response.setHeader(name,value);
      if(!response.headersSent && !response.getHeader("Content-Type")){
        response.setHeader("Content-Type",basename(filePath).endsWith(".html")?"text/html; charset=utf-8":"application/octet-stream");
      }
      createReadStream(filePath)
        .on("error",(error)=>{
          if(!response.headersSent) response.statusCode=404;
          response.end(JSON.stringify({error:error.message}));
        })
        .pipe(response);
    }
  };
}

async function parseBody(request){
  if(request.method==="GET" || request.method==="HEAD") return {};
  const chunks=[];
  let size=0;
  for await(const chunk of request){
    size+=chunk.length;
    if(size>1024*1024) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  if(chunks.length===0) return {};
  const text=Buffer.concat(chunks).toString("utf8");
  try{return JSON.parse(text);}
  catch(error){throw new Error(`Invalid JSON request body: ${error.message}`);}
}

export function createApiServer(){
  const routes=[];
  let errorHandler=null;
  const app={
    get(path,handler){routes.push({method:"GET",path,handler});},
    post(path,handler){routes.push({method:"POST",path,handler});},
    use(handler){if(handler.length===4) errorHandler=handler;},
    listen(port,callback){
      const server=createServer(async(request,response)=>{
        response.setHeader("Access-Control-Allow-Origin","*");
        response.setHeader("Access-Control-Allow-Headers","Content-Type");
        response.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
        if(request.method==="OPTIONS"){
          response.statusCode=204;
          return response.end();
        }

        const url=new URL(request.url||"/","http://127.0.0.1");
        const route=routes.find((candidate)=>candidate.method===request.method && matchPath(candidate.path,url.pathname));
        if(!route){
          response.statusCode=404;
          return response.end(JSON.stringify({error:"Route not found"}));
        }

        const wrappedResponse=createResponse(response);
        const wrappedRequest={
          ...request,
          query:Object.fromEntries(url.searchParams.entries()),
          params:matchPath(route.path,url.pathname),
          body:{}
        };
        try{
          wrappedRequest.body=await parseBody(request);
          await route.handler(wrappedRequest,wrappedResponse,(error)=>{
            if(error) throw error;
          });
        }catch(error){
          if(errorHandler) return errorHandler(error,wrappedRequest,wrappedResponse,()=>{});
          if(!response.headersSent){
            response.statusCode=500;
            response.setHeader("Content-Type","application/json; charset=utf-8");
            response.end(JSON.stringify({error:error.message}));
          }
        }
      });
      return server.listen(port,callback);
    }
  };
  return app;
}
