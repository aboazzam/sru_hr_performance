require("./tmp-env.cjs");
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
(async () => {
  const { data: units } = await admin.from("org_units").select("id,name_ar").is("deleted_at",null);
  const uN = new Map(units.map(u=>[u.id,u.name_ar]));
  const { data: pos } = await admin.from("org_structure_positions").select("name_ar,org_unit_id").is("deleted_at",null).order("name_ar");
  const label = p => { const u = p.org_unit_id ? uN.get(p.org_unit_id) : null; return u && u !== p.name_ar ? `${p.name_ar} — ${u}` : p.name_ar; };
  console.log("ما تعرضه القائمة اليوم (أول ٨):");
  pos.slice(0,8).forEach(p=>console.log("  •", label(p)));
  const noUnit = pos.filter(p=>!p.org_unit_id);
  console.log("\nمناصب بلا وحدة (لا يظهر لها اسم إدارة):", noUnit.length);
  noUnit.forEach(p=>console.log("  •", p.name_ar));
})();
