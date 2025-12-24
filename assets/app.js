document.addEventListener("DOMContentLoaded",()=>{const m=document.getElementById("modal"); if(m) m.hidden=true;});


/* ===== Helpers ===== */
const $ = (id)=>document.getElementById(id);
const LS = {
  get:(k, fallback)=>{ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):fallback; }catch{ return fallback; } },
  set:(k,v)=>localStorage.setItem(k, JSON.stringify(v)),
};
const nowIso = ()=> new Date().toISOString();

function setPageTitle(t){
  document.title = t;
  $("pageTitle").textContent = t;
}

function showScreen(which){
  ["screenIntro","screenLogin","screenShell"].forEach(id=>$(id).classList.remove("active"));
  $(which).classList.add("active");
}

function showView(id){
  document.querySelectorAll(".view").forEach(v=>{
    v.classList.remove("active");
    v.style.display = "none";
  });
  const el = document.getElementById(id);
  if(el){
    el.classList.add("active");
    el.style.display = "block";
  }
}

function setNavActive(route){
  document.querySelectorAll(".navbtn[data-route]").forEach(btn=>{
    btn.classList.toggle("active", btn.getAttribute("data-route")===route);
  });
}

/* ===== Modal confirm ===== */
function confirmModal({title="تأكيد", text="هل أنت متأكد؟", icon="⚠️", okText="تأكيد"}){
  return new Promise((resolve)=>{
    const modal = $("modal");
    const okBtn = $("modalOk");
    const cancelBtn = $("modalCancel");

    $("modalTitle").textContent = title;
    $("modalText").textContent = text;
    $("modalIcon").textContent = icon;
    okBtn.textContent = okText;

    modal.hidden = false;

    const cleanup = ()=>{
      modal.hidden = true;
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      modal.onclick = null;
    };

    cancelBtn.onclick = ()=>{ cleanup(); resolve(false); };
    okBtn.onclick = ()=>{ cleanup(); resolve(true); };
    modal.onclick = (e)=>{ if(e.target === modal){ cleanup(); resolve(false); } };
  });
}

/* ===== Data ===== */
const KEYS = {
  audit:"hi_audit_log",
  fields:"hi_custom_fields",
  users:"hi_users",
  session:"hi_session",
  db:"hi_candidates",
  schema:"hi_score_schema",
  seeded:"hi_seeded_v1",
};

const DEFAULT_USERS = [{username:"admin", password:"admin", role:"مدير النظام"}];

const DEFAULT_FIELDS = [{"key": "prevJob", "label": "وظيفة سابقة", "type": "select", "options": ["عاطل", "كهرب", "تكسي", "قمامه", "سطحه", "عدل", "شرطه", "مطعم", "ورشه", "منجم", "تدوير", "خياطه"]}];


let scoreSchema = [];
let candidates = [];
let session = null;
let customFields = [];

function normalizeStr(s){ return (s??"").toString().trim(); }
function safeId(s){ return normalizeStr(s).replace(/\s+/g,""); }

function ensureCandidateCustom(cand){
  if(!cand.custom || typeof cand.custom !== "object") cand.custom = {};
  return cand.custom;
}

function calcScore(cand){
  let total = 0;
  for(const s of scoreSchema){
    const v = Number(cand.scores?.[s.key] ?? 0);
    const max = Number(s.max ?? 1);
    // clamp 0..max
    const vv = Math.max(0, Math.min(max, isFinite(v)?v:0));
    total += vv;
  }
  return total;
}

function statusBadge(status){
  if(status==="مقبول") return `<span class="badge ok">مقبول</span>`;
  if(status==="مرفوض") return `<span class="badge no">مرفوض</span>`;
  return `<span class="badge pending">قيد المراجعة</span>`;
}

async function seedIfNeeded(){
  if(LS.get(KEYS.seeded,false)) return;
  const res = await fetch("/data/candidates.seed.json", {cache:"no-store"});
  const seed = await res.json();

  scoreSchema = seed.scoreSchema || [];
  candidates = (seed.candidates || []).map(c=>{
    // Ensure minimal shape
    c.id = safeId(c.id || c.nationalId || crypto.randomUUID());
    c.nationalId = c.nationalId || c.id;
    c.status = c.status || "قيد المراجعة";
    c.updatedAt = c.updatedAt || null;
    c.scores = c.scores || {};
    c.custom = (c.custom && typeof c.custom==='object') ? c.custom : {};
    // normalize schema keys present
    for(const s of scoreSchema){
      if(c.scores[s.key]===undefined) c.scores[s.key]=0;
    }
    return c;
  });

  LS.set(KEYS.schema, scoreSchema);
  LS.set(KEYS.db, candidates);
  LS.set(KEYS.users, DEFAULT_USERS);
  LS.set(KEYS.fields, DEFAULT_FIELDS);
  LS.set(KEYS.seeded, true);
}

function loadAll(){
  scoreSchema = LS.get(KEYS.schema, scoreSchema);
  candidates = LS.get(KEYS.db, candidates);
  const users = LS.get(KEYS.users, DEFAULT_USERS);
  session = LS.get(KEYS.session, null);
  customFields = LS.get(KEYS.fields, DEFAULT_FIELDS);
  return {users};
}

function saveCandidates(){ LS.set(KEYS.db, candidates); }
function saveUsers(users){ LS.set(KEYS.users, users); }

/* ===== Auth ===== */
function setSession(s){
  session = s;
  LS.set(KEYS.session, s);
}

function clearSession(){
  session = null;
  localStorage.removeItem(KEYS.session);
}

function isAdmin(){ return session?.role === "مدير النظام"; }
function canEdit(){ return session?.role === "مدير النظام" || session?.role === "مراجع"; }

/* ===== UI Bindings ===== */
function bindGlobal(){
  $("introStartBtn").addEventListener("click", ()=>{
    // إذا يوجد جلسة مسجلة -> دخول مباشر للوحة التحكم
    if(session){
      $("userChip").hidden = false;
      $("chipName").textContent = session.username;
      $("chipRole").textContent = session.role;
      $("adminNavBtn").style.display = (session.role==="مدير النظام") ? "inline-flex" : "none";
      if($("controlNavBtn")) $("controlNavBtn").style.display = (session.role==="مدير النظام") ? "inline-flex" : "none";
      if($("auditNavBtn")) $("auditNavBtn").style.display = (session.role==="مدير النظام") ? "inline-flex" : "none";
      showScreen("screenShell");
      route(location.hash || "#/dashboard");
      return;
    }
    showScreen("screenLogin");
    setPageTitle("مقابلات الصحة: تسجيل الدخول");
    $("loginUser").value="";
    $("loginPass").value="";
    $("loginUser").focus();
  });
  $("backToIntroBtn").addEventListener("click", ()=>{
    showScreen("screenIntro");
  setPageTitle("مقابلات الصحة");
  setTimeout(()=>{
    document.getElementById("screenIntro")?.classList.add("introOut");
  }, 3500);
  setTimeout(()=>{
    if(session){
      $("userChip").hidden = false;
      $("chipName").textContent = session.username;
      $("chipRole").textContent = session.role;
      $("adminNavBtn").style.display = (session.role==="مدير النظام") ? "inline-flex" : "none";
      if($("controlNavBtn")) $("controlNavBtn").style.display = (session.role==="مدير النظام") ? "inline-flex" : "none";
      if($("auditNavBtn")) $("auditNavBtn").style.display = (session.role==="مدير النظام") ? "inline-flex" : "none";
      showScreen("screenShell");
      route(location.hash || "#/dashboard");
    }else{
      showScreen("screenLogin");
      setPageTitle("مقابلات الصحة: تسجيل الدخول");
      $("loginUser").value="";
      $("loginPass").value="";
    }
  }, 4000);
});
  $("loginBtn").addEventListener("click", doLogin);
  $("logoutBtn").addEventListener("click", askLogout);
  $("sidebarLogoutBtn").addEventListener("click", askLogout);

  window.addEventListener("hashchange", ()=>route(location.hash || "#/dashboard"));
  window.addEventListener("beforeunload", (e)=>{
    // If on candidate edit with unsaved changes, we still autosave on Save button only.
    // We'll just keep minimal prompt
    if(session){ e.preventDefault(); e.returnValue=""; }
  });
}

async function doLogin(){
  const u = normalizeStr($("loginUser").value);
  const p = normalizeStr($("loginPass").value);
  const users = LS.get(KEYS.users, DEFAULT_USERS);

  const found = users.find(x=>x.username===u && x.password===p);
  if(!found){ toast("خطأ","بيانات الدخول غير صحيحة"); return; }
  setSession({username:found.username, role:found.role});
  $("userChip").hidden = false;
  $("chipName").textContent = found.username;
  $("chipRole").textContent = found.role;

  $("adminNavBtn").style.display = (found.role==="مدير النظام") ? "inline-flex" : "none";
  if($("controlNavBtn")) $("controlNavBtn").style.display = (found.role==="مدير النظام") ? "inline-flex" : "none";
  if($("auditNavBtn")) $("auditNavBtn").style.display = (found.role==="مدير النظام") ? "inline-flex" : "none";
  showScreen("screenShell");
  route("#/dashboard");
}

async function askLogout(){
  const ok = await confirmModal({title:"تسجيل خروج", text:"هل تريد الخروج من النظام؟", icon:"🚪", okText:"خروج"});
  if(!ok) return;
  clearSession();
  location.hash="";
  location.reload();
}

/* ===== Routing ===== */
function route(hash){
  if(!session){
    showScreen("screenLogin");
    setPageTitle("مقابلات الصحة: تسجيل الدخول");
    return;
  }
  const h = hash || "#/dashboard";
  if(h.startsWith("#/dashboard")){
    setNavActive("#/dashboard");
    setPageTitle("مقابلات الصحة: لوحة التحكم");
    showView("viewDashboard");
    refreshDashboard();
    return;
  }
  if(h.startsWith("#/candidates")){
    setNavActive("#/candidates");
    setPageTitle("مقابلات الصحة: قائمة المرشحين");
    showView("viewCandidates");
    refreshCandidates();
    return;
  }
  if(h.startsWith("#/candidate/")){
    setNavActive("#/candidates");
    const id = decodeURIComponent(h.split("#/candidate/")[1] || "");
    openCandidate(id);
    return;
  }
  if(h.startsWith("#/audit")){
    if(!isAdmin()){ route("#/dashboard"); return; }
    setNavActive("#/audit");
    setPageTitle("مقابلات الصحة: المراقبة");
    showView("viewAudit");
    renderAuditTable();
    return;
  }
  if(h.startsWith("#/control")){
    if(!isAdmin()){ route("#/dashboard"); return; }
    setNavActive("#/control");
    setPageTitle("مقابلات الصحة: التحكم");
    showView("viewControl");
    renderFieldsTable();
    return;
  }
  if(h.startsWith("#/admin")){
    if(!isAdmin()){
      route("#/dashboard");
      return;
    }
    setNavActive("#/admin");
    setPageTitle("مقابلات الصحة: الإدارة");
    showView("viewAdmin");
    renderUsersTable();
    return;
  }
  route("#/dashboard");
}

/* ===== Dashboard ===== */
function refreshDashboard(){
  const total = candidates.length;
  const accepted = candidates.filter(c=>c.status==="مقبول").length;
  const rejected = candidates.filter(c=>c.status==="مرفوض").length;
  const pending = total - accepted - rejected;

  $("statTotal").textContent = total;
  $("statAccepted").textContent = accepted;
  $("statRejected").textContent = rejected;
  $("statPending").textContent = pending;

  // latest 5 updated
  const latest = [...candidates]
    .filter(c=>c.updatedAt)
    .sort((a,b)=> (b.updatedAt||"").localeCompare(a.updatedAt||""))
    .slice(0,5);

  $("latestList").innerHTML = latest.length ? latest.map(c=>`
    <div class="latestitem">
      <div>
        <div style="font-weight:900">${escapeHtml(c.name || "بدون اسم")}</div>
        <div class="muted">${escapeHtml(c.nationalId || c.id)} • ${escapeHtml(c.interviewer || "—")}</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center">
        ${statusBadge(c.status)}
        <button class="ghost" onclick="location.hash='#/candidate/${encodeURIComponent(c.id)}'">عرض</button>
      </div>
    </div>
  `).join("") : `<div class="muted">لا يوجد مراجعات حديثة بعد.</div>`;
}

/* ===== Candidates list ===== */
function refreshCandidates(){
  $("searchBox").oninput = renderCards;
  $("statusFilter").onchange = renderCards;
  $("addCandidateBtn").onclick = addCandidateFlow;
  renderCards();
}

function renderCards(){
  const q = normalizeStr($("searchBox").value).toLowerCase();
  const f = $("statusFilter").value;

  const list = candidates.filter(c=>{
    const hay = `${c.name||""} ${c.nationalId||""}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okF = (f==="all") || (c.status===f);
    return okQ && okF;
  });

  $("cards").innerHTML = list.map(c=>{
    const score = calcScore(c);
    return `
      <div class="card">
        <div class="cardtop">
          <div>
            <div class="cardname">${escapeHtml(c.name || "بدون اسم")}</div>
            <div class="cardmeta">
              <div>الرقم الوطني: <b>${escapeHtml(c.nationalId || c.id)}</b></div>
              <div>العمر: <b>${escapeHtml(c.age || "—")}</b> • المقابل: <b>${escapeHtml(c.interviewer || "—")}</b></div>
              <div>المجموع: <b>${score}</b></div>
            </div>
          </div>
          ${statusBadge(c.status)}
        </div>
        <div class="cardactions">
          <button class="primary" onclick="location.hash='#/candidate/${encodeURIComponent(c.id)}'">
            <span class="btnicon">🔎</span><span>عرض التفاصيل</span>
          </button>
        </div>
      </div>
    `;
  }).join("") || `<div class="muted">لا يوجد نتائج مطابقة.</div>`;
}

async function addCandidateFlow(){
  if(!canEdit()){
    alert("صلاحيات غير كافية"); return;
  }
  const newId = "cand-" + Math.random().toString(16).slice(2,10);
  const blank = {
    id:newId,
    name:"",
    nationalId:"",
    age:"",
    prevJob:"",
    criminalRecord:"",
    experience:"",
    license:"",
    tattoos:"",
    intentPolice:"",
    noObjectionCert:"",
    isFormerParamedic:"",
    certificate:"",
    interviewer: session.username,
    hours:"",
    micQuality:"",
    answersAll:"",
    strengths:"",
    notes:"",
    status:"قيد المراجعة",
    updatedAt:null,
    scores:{}
  };
  for(const s of scoreSchema) blank.scores[s.key]=0;
  candidates.unshift(blank);
  saveCandidates();
  location.hash = "#/candidate/" + encodeURIComponent(newId);
}

/* ===== Candidate detail ===== */
let currentCandidateId = null;
let dirty = false;

function setDirty(v){ dirty = v; }

function bindCandidateInputs(disabled){
  const ids = [
    "c_name","c_nid","c_age","c_interviewer","c_mic","c_hours",
    "c_prevJob","c_criminal","c_experience","c_license","c_tattoos","c_intentPolice","c_noObj","c_emt",
    "c_strengths","c_notes","c_status"
  ];
  ids.forEach(id=>{
    const el=$(id);
    if(id==="c_interviewer"){ el.disabled = true; }
    else{ el.disabled = disabled; }
    el.oninput = ()=>{ setDirty(true); updateSummaryLive(); };
    el.onchange = ()=>{ setDirty(true); updateSummaryLive(); };
  });
}

function renderScoresGrid(cand, disabled){
  const wrap = $("scoresGrid");
  wrap.innerHTML = scoreSchema.map(s=>{
    const v = cand.scores?.[s.key] ?? 0;
    return `
      <div class="scorecell">
        <div class="slabel">
          <span>(${escapeHtml(s.label)})</span>
          <span class="muted">/ ${s.max}</span>
        </div>
        <input data-scorekey="${escapeHtml(s.key)}" inputmode="numeric" value="${Number(v)||0}" ${disabled?"disabled":""}/>
      </div>
    `;
  }).join("");

  applyScoreStates();
  wrap.querySelectorAll("input[data-scorekey]").forEach(inp=>{
    inp.addEventListener("input", ()=>{
      const key = inp.getAttribute("data-scorekey");
      let val = Number(inp.value);
      if(!isFinite(val)) val = 0;
      const schema = scoreSchema.find(x=>x.key===key);
      if(schema){
        val = Math.max(0, Math.min(Number(schema.max||1), val));
      }
      inp.value = val;
      cand.scores[key]=val;
      setDirty(true);
      updateScoreUI(cand);
      applyScoreStates();
      updateSummaryLive();
    });
  });
}

function applyScoreStates(){
  const wrap = $("scoresGrid");
  if(!wrap) return;
  wrap.querySelectorAll(".scorecell").forEach(cell=>{
    cell.classList.remove("state0","state1","state2");
    const inp = cell.querySelector("input[data-scorekey]");
    if(!inp) return;
    const v = Number(inp.value);
    if(v===0) cell.classList.add("state0");
    else if(v===1) cell.classList.add("state1");
    else if(v===2) cell.classList.add("state2");
  });
}

function updateScoreUI(cand){
  const total = calcScore(cand);
  $("scoreTotal").textContent = total;
}

function fillCandidateForm(c){
  $("c_name").value = c.name || "";
  $("c_nid").value = c.nationalId || "";
  $("c_age").value = c.age || "";
  $("c_interviewer").value = (c.interviewer || session?.username || "");

  $("c_mic").value = c.micQuality || "";
  $("c_hours").value = c.hours || "";

  $("c_prevJob").value = c.prevJob || "";
  $("c_criminal").value = c.criminalRecord || "";
  $("c_experience").value = c.experience || "";
  $("c_license").value = c.license || "";
  $("c_tattoos").value = c.tattoos || "";
  $("c_intentPolice").value = c.intentPolice || "";
  $("c_noObj").value = c.noObjectionCert || "";
  $("c_emt").value = c.isFormerParamedic || "";

  $("c_strengths").value = c.strengths || "";
  $("c_notes").value = c.notes || "";
  $("c_status").value = c.status || "قيد المراجعة";
}

function readCandidateFormInto(c){
  c.name = normalizeStr($("c_name").value);
  c.nationalId = normalizeStr($("c_nid").value);
  c.age = normalizeStr($("c_age").value);
  c.interviewer = normalizeStr($("c_interviewer").value);

  c.micQuality = normalizeStr($("c_mic").value);
  c.hours = normalizeStr($("c_hours").value);

  c.prevJob = normalizeStr($("c_prevJob").value);
  c.criminalRecord = normalizeStr($("c_criminal").value);
  c.experience = normalizeStr($("c_experience").value);
  c.license = normalizeStr($("c_license").value);
  c.tattoos = normalizeStr($("c_tattoos").value);
  c.intentPolice = normalizeStr($("c_intentPolice").value);
  c.noObjectionCert = normalizeStr($("c_noObj").value);
  c.isFormerParamedic = normalizeStr($("c_emt").value);

  c.strengths = normalizeStr($("c_strengths").value);
  c.notes = normalizeStr($("c_notes").value);
  c.status = normalizeStr($("c_status").value) || "قيد المراجعة";
}

function buildCustomSummaryBlock(c){
  customFields = LS.get(KEYS.fields, DEFAULT_FIELDS);
  ensureCandidateCustom(c);
  const lines = [];
  for(const f of customFields){
    const v = c.custom?.[f.key];
    if(v!==undefined && v!==null && String(v).trim()!==""){
      lines.push(`${f.label} : ${v}`);
    }
  }
  return lines.length ? ("\n" + lines.join("\n")) : "";
}

function buildSummaryText(c){
  const total = calcScore(c);
  const answersVal = `المجموع: ${total}`;
return `الاسم : ${c.name || ""} 
الرقم الوطني : ${c.nationalId || ""} 
العمر : ${c.age || ""} 
جودة المايك : ${c.micQuality || ""}
عدد ساعات التواجد : ${c.hours || ""}
جميع الاجوبة : ${answersVal}
المميزات : ${c.strengths || ""}
الملاحظات : ${c.notes || ""}
مسعف سابق: ${c.isFormerParamedic || ""} 
شهادة : ${c.certificate || ""}   
المقابل: ${c.interviewer || ""}
<@&827121686499295252>${buildCustomSummaryBlock(c)}`;
}

function updateSummaryLive(){
  const id = currentCandidateId;
  const c = candidates.find(x=>x.id===id);
  if(!c) return;

  // Read live (even if no save) to update summary in real-time
  const temp = structuredClone(c);
  readCandidateFormInto(temp);
  $("summaryBox").textContent = buildSummaryText(temp);
}

async function openCandidate(id){
  const c = candidates.find(x=>x.id===id);
  if(!c){
    alert("لم يتم العثور على المرشح"); location.hash="#/candidates"; return;
  }
  currentCandidateId = id;
  showView("viewCandidate");
  setPageTitle(`مقابلات الصحة: ملف المرشح (${c.name||c.nationalId||c.id})`);
  $("backToListBtn").onclick = async ()=>{
    
    setDirty(false);
    location.hash="#/candidates";
  };

  $("copyBtn").onclick = async ()=>{
    await navigator.clipboard.writeText($("summaryBox").textContent || "");
    toast("تم النسخ", "تم نسخ الملخص النهائي"); logEvent("نسخ","ملخص", currentCandidateId||"");
};

  // Permissions
  const disabled = !canEdit();
  $("saveBtn").style.display = canEdit() ? "inline-flex" : "none";
  $("deleteCandidateBtn").style.display = isAdmin() ? "inline-flex" : "none";

  bindCandidateInputs(disabled);
  fillCandidateForm(c);
  renderScoresGrid(c, disabled);
  updateScoreUI(c);
  applyScoreStates();
  $("summaryBox").textContent = buildSummaryText(c);
  setDirty(false);

  $("saveBtn").onclick = async ()=>{
    readCandidateFormInto(c);
    c.updatedAt = nowIso();
    // if nationalId changed, keep id stable; but ensure display
    saveCandidates();
    setDirty(false);
    refreshDashboard();
    refreshCandidates();
    $("summaryBox").textContent = buildSummaryText(c);
    toast("تم الحفظ", "تم حفظ التعديلات"); logEvent("تعديل","مرشح", currentCandidateId||"");
};

  $("deleteCandidateBtn").onclick = async ()=>{
    candidates = candidates.filter(x=>x.id!==id);
    saveCandidates();
    setDirty(false);
    location.hash="#/candidates";
    refreshDashboard();
  };

  // live update initial
  updateSummaryLive();
}

/* ===== Admin (Users) ===== */
function renderUsersTable(){
  if(!isAdmin()){
    showView("viewDashboard");
    return;
  }
  const users = LS.get(KEYS.users, DEFAULT_USERS);
  const t = $("usersTable");
  t.innerHTML = `
    <tr>
      <th>اسم المستخدم</th>
      <th>الصلاحية</th>
      <th>حذف</th>
    </tr>
  `;

  users.forEach((u, idx)=>{
    const isSelf = u.username === session.username;
    t.innerHTML += `
      <tr>
        <td>${escapeHtml(u.username)}</td>
        <td>
          <select data-uidx="${idx}" ${isSelf?"disabled":""}>
            ${["مدير النظام","مراجع","قارئ"].map(r=>`<option ${u.role===r?"selected":""}>${r}</option>`).join("")}
          </select>
        </td>
        <td>
          <button class="danger" data-del="${idx}" ${isSelf?"disabled":""}>حذف</button>
        </td>
      </tr>
    `;
  });

  // change role
  t.querySelectorAll("select[data-uidx]").forEach(sel=>{
    sel.onchange = async ()=>{
      const idx = Number(sel.getAttribute("data-uidx"));
      const users2 = LS.get(KEYS.users, DEFAULT_USERS);
      users2[idx].role = sel.value;
      saveUsers(users2);
      };
  });

  // delete user
  t.querySelectorAll("button[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      const idx = Number(btn.getAttribute("data-del"));
      const users2 = LS.get(KEYS.users, DEFAULT_USERS);
      const target = users2[idx];
      users2.splice(idx,1);
      saveUsers(users2);
      renderUsersTable();
    };
  });

  $("addUserBtn").onclick = async ()=>{
    const username = normalizeStr($("u_user").value);
    const password = normalizeStr($("u_pass").value);
    const role = $("u_role").value;
    if(!username || !password){
      toast("تنبيه","أدخل اسم المستخدم وكلمة المرور"); return;
    }
    const users2 = LS.get(KEYS.users, DEFAULT_USERS);
    if(users2.some(u=>u.username===username)){
      toast("تنبيه","اسم المستخدم مستخدم مسبقاً"); return;
    }
    users2.push({username,password,role});
    saveUsers(users2);
    $("u_user").value=""; $("u_pass").value=""; $("u_role").value="مراجع";
    renderUsersTable();
    alert("تمت إضافة المستخدم");
};
}


/* ===== Toast + Audit ===== */
function toast(title, msg=""){
  const host = document.getElementById("toastHost");
  if(!host) return alert([title,msg].filter(Boolean).join(" - "));
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div class="toastIcon">✨</div>
    <div class="toastText">
      <div class="toastTitle">${escapeHtml(title)}</div>
      <div class="toastMsg">${escapeHtml(msg)}</div>
    </div>
  `;
  host.appendChild(el);
  setTimeout(()=>{ el.style.opacity="0"; el.style.transform="translateY(8px)"; }, 2200);
  setTimeout(()=>{ el.remove(); }, 2600);
}

function nowStamp(){
  const d = new Date();
  const pad = (n)=> String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function logEvent(action, target, details=""){
  const who = session?.username || "system";
  const entry = {ts: Date.now(), at: nowStamp(), who, action, target, details};
  const list = LS.get(KEYS.audit, []);
  list.unshift(entry);
  LS.set(KEYS.audit, list.slice(0, 500));
}


/* ===== Control (Custom Fields) ===== */
let editingFieldKey = null;

function renderFieldsTable(){
  if(!isAdmin()){ showView("viewDashboard"); return; }
  customFields = LS.get(KEYS.fields, DEFAULT_FIELDS);

  const t = $("fieldsTable");
  t.innerHTML = `
    <tr>
      <th>اسم الحقل</th>
      <th>النوع</th>
      <th>خيارات</th>
      <th>إجراءات</th>
    </tr>
  `;

  customFields.forEach((f)=>{
    const optsCount = (f.options||[]).length;
    t.innerHTML += `
      <tr>
        <td>${escapeHtml(f.label)}</td>
        <td>${escapeHtml(f.type)}</td>
        <td>${f.type==="select" ? (optsCount + " خيار") : "—"}</td>
        <td>
          <div class="rowactions">
            <button class="ghost tiny" onclick="editField('${escapeHtml(f.key)}')">تعديل</button>
            <button class="danger tiny" onclick="deleteField('${escapeHtml(f.key)}')">حذف</button>
          </div>
        </td>
      </tr>
    `;
  });

  $("saveFieldBtn").onclick = saveField;
  $("clearFieldBtn").onclick = clearFieldForm;
}

function editField(key){
  customFields = LS.get(KEYS.fields, DEFAULT_FIELDS);
  const f = customFields.find(x=>x.key===key);
  if(!f) return;
  editingFieldKey = f.key;
  $("f_name").value = f.label || "";
  $("f_type").value = f.type || "select";
  $("f_options").value = (f.options||[]).join("\n");
}

function clearFieldForm(){
  editingFieldKey = null;
  $("f_name").value = "";
  $("f_type").value = "select";
  $("f_options").value = "";
}

function saveField(){
  const label = normalizeStr($("f_name").value);
  const type = $("f_type").value;
  const options = normalizeStr($("f_options").value).split("\n").map(x=>x.trim()).filter(Boolean);

  if(!label){ toast("تنبيه","أدخل اسم الحقل"); return; }
  if(type==="select" && options.length===0){ toast("تنبيه","أدخل خيارات للحقل"); return; }

  customFields = LS.get(KEYS.fields, DEFAULT_FIELDS);

  const key = editingFieldKey || ("f_" + Math.random().toString(16).slice(2,10));
  const newField = {key, label, type, options: type==="select" ? options : []};

  const idx = customFields.findIndex(x=>x.key===key);
  if(idx>=0) customFields[idx]=newField;
  else customFields.push(newField);

  LS.set(KEYS.fields, customFields);
  alert("تم حفظ الحقل");
  clearFieldForm();
  renderFieldsTable();

  if(currentCandidateId){
    const c = candidates.find(x=>x.id===currentCandidateId);
    if(c) renderDynamicFields(c);
    applyCustomFieldsToForm();
  }
}

function deleteField(key){
  customFields = LS.get(KEYS.fields, DEFAULT_FIELDS);
  customFields = customFields.filter(x=>x.key!==key);
  LS.set(KEYS.fields, customFields);
  alert("تم حذف الحقل");
  renderFieldsTable();

  if(currentCandidateId){
    const c = candidates.find(x=>x.id===currentCandidateId);
    if(c) renderDynamicFields(c);
    applyCustomFieldsToForm();
  }
}

function renderAuditTable(){
  const t = $("auditTable");
  const list = LS.get(KEYS.audit, []);
  t.innerHTML = `
    <tr>
      <th>الوقت</th>
      <th>المستخدم</th>
      <th>العملية</th>
      <th>الهدف</th>
      <th>تفاصيل</th>
    </tr>
  `;
  list.forEach(e=>{
    t.innerHTML += `
      <tr>
        <td>${escapeHtml(e.at || "")}</td>
        <td>${escapeHtml(e.who || "")}</td>
        <td>${escapeHtml(e.action || "")}</td>
        <td>${escapeHtml(e.target || "")}</td>
        <td>${escapeHtml(e.details || "")}</td>
      </tr>
    `;
  });
  if($("clearAuditBtn")){
    $("clearAuditBtn").onclick = ()=>{
      LS.set(KEYS.audit, []);
      toast("تم", "تم مسح السجل");
      renderAuditTable();
    };
  }
}

/* ===== Utils ===== */
function escapeHtml(str){
  return (str??"").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll("\"","&quot;")
    .replaceAll("'","&#039;");
}

/* ===== Init ===== */
(async function init(){
  await seedIfNeeded();
  const {users} = loadAll();

  bindGlobal();

  // Always start on Intro screen
  showScreen("screenIntro");
  setPageTitle("مقابلات الصحة");
// Sidebar route buttons
  document.querySelectorAll(".navbtn[data-route]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const r = btn.getAttribute("data-route");
      location.hash = r;
    });
  });
})();
