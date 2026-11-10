const items=[
  ["summary","Summary"],
  ["time-entries","Time Entries"],
  ["employees","Employees"],
  ["projects","Projects"],
  ["payroll","Payroll"]
];

export default function Sidebar({activeView,onNavigate}) {
  return (
    <aside className="sidebar">
      <nav aria-label="Primary navigation">
        {items.map(([value,label])=><button type="button" className={activeView===value?"active":""} onClick={()=>onNavigate(value)} key={value}>{label}</button>)}
      </nav>
    </aside>
  );
}
