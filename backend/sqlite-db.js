import {DatabaseSync} from "node:sqlite";
import path from "node:path";
let database;
export function getSqliteDatabase(){
  if(!database){
    const file=path.resolve(import.meta.dirname,process.env.SQLITE_PATH||"../database/mockup-practice.db");
    database=new DatabaseSync(file); database.exec("PRAGMA foreign_keys=ON");
  }
  return database;
}
