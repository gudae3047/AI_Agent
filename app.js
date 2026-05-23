// ═══════════════════════════════════════════
//   C# Agent — app.js
// ═══════════════════════════════════════════

let KB = [];          // Knowledge base
let chatHistory = []; // Chat messages
let modHistory = [];  // Modify history
let isBusy = false;

// ── API ─────────────────────────────────────
async function callClaude(messages, system, maxTokens = 2000) {
  const key = document.getElementById('api-key').value.trim();
  if (!key) { toast('사이드바에 API Key를 입력해주세요', 'err'); throw new Error('No API key'); }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: system || undefined,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.content?.find(b => b.type === 'text')?.text || '';
}

// ── API key indicator ────────────────────────
document.getElementById('api-key').addEventListener('input', function () {
  const dot = document.getElementById('api-dot');
  dot.className = 'api-dot' + (this.value.startsWith('sk-ant') ? ' ok' : '');
});

// ── Tab navigation ───────────────────────────
function switchTab(btn, panel) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + panel).classList.add('active');
}

// ── Toast ────────────────────────────────────
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

// ── Line numbers ─────────────────────────────
function syncLn(ta, lnId) {
  const lines = ta.value.split('\n').length;
  document.getElementById(lnId).textContent =
    Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

// ── Drag & drop ──────────────────────────────
const uz = document.getElementById('upload-zone');
uz.addEventListener('dragover',  e => { e.preventDefault(); uz.classList.add('drag-over'); });
uz.addEventListener('dragleave', () => uz.classList.remove('drag-over'));
uz.addEventListener('drop', e => {
  e.preventDefault(); uz.classList.remove('drag-over');
  handleFiles(e.dataTransfer.files);
});

async function handleFiles(files) {
  for (const f of Array.from(files)) {
    const text = await f.text();
    await processEntry(f.name, text);
  }
}

// ── Analyze & store ──────────────────────────
async function analyzeCode() {
  const code = document.getElementById('paste-code').value.trim();
  const name = document.getElementById('paste-name').value.trim() || 'Code.cs';
  if (!code) { toast('코드를 입력해주세요', 'err'); return; }
  await processEntry(name, code);
}

function setKbStatus(msg, type = '') {
  const el = document.getElementById('kb-status');
  el.textContent = msg; el.className = 'status-txt ' + type;
}

function setBtnLoading(spinId, lblId, loading, label) {
  document.getElementById(spinId).classList.toggle('hidden', !loading);
  if (label) document.getElementById(lblId).textContent = loading ? '처리 중...' : label;
}

async function processEntry(filename, code) {
  setKbStatus('분석 중...', 'busy');
  setBtnLoading('a-spin', 'a-lbl', true, '분석 & 저장');
  document.getElementById('abtn').disabled = true;

  try {
    const raw = await callClaude(
      [{ role: 'user', content: `파일명: ${filename}\n\n${code.slice(0, 4000)}` }],
      `C# 코드를 분석하고 순수 JSON만 반환하세요 (마크다운 없이):
{"summary":"1~2줄 역할 요약","type":"Service|Controller|Repository|Model|Interface|Utility|Other","namespace":"네임스페이스","mainClass":"주요 클래스","patterns":["패턴"],"dependencies":["의존성"],"methods":["주요 메서드 최대5개"]}`,
      600
    );

    let analysis;
    try { analysis = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
    catch { analysis = { summary: '분석 완료', type: 'Other', mainClass: filename.replace('.cs',''), patterns: [], dependencies: [], methods: [] }; }

    const entry = { id: Date.now() + Math.random(), filename, code, analysis, addedAt: new Date().toLocaleString('ko-KR') };
    KB.push(entry);
    saveKB(); renderKB();
    setKbStatus(`✓ '${filename}' 저장 완료`, 'ok');
    toast(`'${filename}' 저장됨`, 'ok');
    clearPaste();
  } catch (e) {
    setKbStatus('오류: ' + e.message, 'err');
    toast('분석 실패: ' + e.message, 'err');
  } finally {
    setBtnLoading('a-spin', 'a-lbl', false, '분석 & 저장');
    document.getElementById('abtn').disabled = false;
  }
}

function clearPaste() {
  ['paste-code','paste-name','paste-ns'].forEach(id => document.getElementById(id).value = '');
  syncLn(document.getElementById('paste-code'), 'ln-kb');
  setKbStatus('');
}

// ── Render KB ────────────────────────────────
function renderKB() {
  const list = document.getElementById('kb-list');
  const n = KB.length;
  document.getElementById('kb-badge').textContent = n;
  document.getElementById('kb-count').textContent = n;
  renderCtxPanel(); renderRefPills();

  if (!n) {
    list.innerHTML = `<div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <p>아직 저장된 코드가 없습니다</p>
      <p class="empty-sub">왼쪽에서 파일을 업로드하거나 코드를 붙여넣으세요</p>
    </div>`;
    return;
  }

  list.innerHTML = KB.map(item => {
    const type = item.analysis.type || 'C#';
    const tags = [...(item.analysis.patterns||[]).slice(0,2), ...(item.analysis.dependencies||[]).slice(0,2)];
    return `<div class="kb-item">
      <div class="kb-item-icon">${type.slice(0,3).toUpperCase()}</div>
      <div class="kb-item-body">
        <div class="kb-item-name">${item.filename}</div>
        <div class="kb-item-meta">${item.analysis.summary || ''}</div>
        ${tags.length ? `<div class="kb-item-tags">${tags.map(t=>`<span class="kb-tag">${t}</span>`).join('')}</div>` : ''}
      </div>
      <div class="kb-item-actions">
        <button class="icon-btn" onclick="removeKB(${item.id})" title="삭제">✕</button>
        <button class="kb-load-btn" onclick="loadToEditor(${item.id})">→ 에디터</button>
      </div>
    </div>`;
  }).join('');
}

function removeKB(id) {
  KB = KB.filter(i => i.id !== id);
  saveKB(); renderKB();
  toast('삭제되었습니다');
}

function loadToEditor(id) {
  const item = KB.find(i => i.id === id);
  if (!item) return;
  document.getElementById('ed-code').value = item.code;
  document.getElementById('ed-fname').value = item.filename;
  document.getElementById('ed-tab').textContent = item.filename;
  syncLn(document.getElementById('ed-code'), 'ln-ed');
  switchTab(document.querySelector('[data-panel=editor]'), 'editor');
  toast(`'${item.filename}' 에디터로 불러옴`);
}

function renderCtxPanel() {
  const list = document.getElementById('ctx-list');
  if (!KB.length) { list.innerHTML = '<p class="muted">지식 베이스가 비어 있습니다</p>'; return; }
  list.innerHTML = KB.map(item => `
    <div class="ctx-item">
      <div class="ctx-item-name">${item.filename}</div>
      <div class="ctx-item-type">${item.analysis.type || 'C#'}</div>
    </div>`).join('');
}

function renderRefPills() {
  const row = document.getElementById('ref-pills');
  if (!KB.length) { row.innerHTML = ''; return; }
  row.innerHTML = KB.slice(0, 4).map(i =>
    `<span class="ref-pill">${i.filename}</span>`
  ).join('') + (KB.length > 4 ? `<span class="ref-pill">+${KB.length - 4}</span>` : '');
}

// ── KB persistence ───────────────────────────
function saveKB() {
  try { localStorage.setItem('csharp_kb_v2', JSON.stringify(KB)); } catch {}
}
function loadKB() {
  try {
    const s = localStorage.getItem('csharp_kb_v2');
    if (s) { KB = JSON.parse(s); renderKB(); }
  } catch {}
}
function exportKB() {
  if (!KB.length) { toast('내보낼 지식이 없습니다', 'err'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(KB, null, 2)], { type: 'application/json' }));
  a.download = 'csharp_kb.json'; a.click();
  toast('내보내기 완료', 'ok');
}
async function importKB(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (Array.isArray(data)) {
      KB = [...KB, ...data]; saveKB(); renderKB();
      toast(`${data.length}개 가져오기 완료`, 'ok');
    }
  } catch { toast('파일 형식 오류', 'err'); }
}

// ── Editor ───────────────────────────────────
function copyEditorCode() {
  const code = document.getElementById('ed-code').value;
  navigator.clipboard.writeText(code).then(() => toast('클립보드에 복사됨', 'ok'));
}
function clearEditor() {
  document.getElementById('ed-code').value = '';
  syncLn(document.getElementById('ed-code'), 'ln-ed');
}
function toAgent() {
  const code = document.getElementById('ed-code').value.trim();
  if (!code) { toast('에디터에 코드를 입력해주세요', 'err'); return; }
  document.getElementById('chat-inp').value =
    `다음 코드를 분석하고 개선 방법을 알려주세요:\n\`\`\`csharp\n${code}\n\`\`\``;
  switchTab(document.querySelector('[data-panel=agent]'), 'agent');
}

async function modifyCode() {
  const code   = document.getElementById('ed-code').value.trim();
  const prompt = document.getElementById('mod-prompt').value.trim();
  if (!code)   { toast('수정할 코드를 에디터에 입력해주세요', 'err'); return; }
  if (!prompt) { toast('수정 요청을 입력해주세요', 'err'); return; }

  const el = document.getElementById('mod-status');
  el.textContent = '수정 중...'; el.className = 'status-txt busy';
  setBtnLoading('m-spin', 'm-lbl', true, '코드 수정');
  document.getElementById('mbtn').disabled = true;

  const saved = code;
  try {
    const kbCtx = buildKBCtx();
    const reply = await callClaude(
      [{ role: 'user', content: `요청: ${prompt}\n\n현재 코드:\n\`\`\`csharp\n${code}\n\`\`\`` }],
      `C# 코드 수정 전문가입니다.
${kbCtx ? `\n=== 지식 베이스 ===\n${kbCtx}\n===\n` : ''}
규칙: 요청에 맞게 정확히 수정하고, 수정된 전체 코드를 \`\`\`csharp 블록으로 반환하세요. 변경사항을 1~2줄로 요약하세요.`,
      2000
    );

    const match = reply.match(/```csharp\n?([\s\S]*?)```/);
    if (match) {
      document.getElementById('ed-code').value = match[1].trim();
      syncLn(document.getElementById('ed-code'), 'ln-ed');
    }

    // history
    const h = { id: Date.now(), prompt, oldCode: saved, newCode: match?.[1]?.trim(), ts: new Date().toLocaleTimeString('ko-KR') };
    modHistory.unshift(h);
    renderModHistory();

    el.textContent = '✓ 수정 완료'; el.className = 'status-txt ok';
    document.getElementById('mod-prompt').value = '';
    toast('코드 수정 완료', 'ok');
  } catch (e) {
    el.textContent = '오류: ' + e.message; el.className = 'status-txt err';
    toast('수정 실패: ' + e.message, 'err');
  } finally {
    setBtnLoading('m-spin', 'm-lbl', false, '코드 수정');
    document.getElementById('mbtn').disabled = false;
  }
}

function renderModHistory() {
  const list = document.getElementById('hist-list');
  if (!modHistory.length) { list.innerHTML = '<p class="muted">수정 내역이 없습니다</p>'; return; }
  list.innerHTML = modHistory.slice(0, 12).map(h => `
    <div class="hist-item">
      <span class="hist-text">${h.ts} — ${h.prompt}</span>
      ${h.newCode ? `<button class="hist-restore-btn" onclick="restoreHist(${h.id})">복원</button>` : ''}
    </div>`).join('');
}

function restoreHist(id) {
  const h = modHistory.find(x => x.id === id);
  if (!h?.newCode) return;
  document.getElementById('ed-code').value = h.newCode;
  syncLn(document.getElementById('ed-code'), 'ln-ed');
  toast('이전 버전 복원됨');
}

// ── AI Agent ─────────────────────────────────
function buildKBCtx() {
  if (!KB.length) return '';
  return KB.map(item => `[${item.filename}] ${item.analysis.type} · ${item.analysis.mainClass}
요약: ${item.analysis.summary}
패턴: ${(item.analysis.patterns||[]).join(', ')}
의존성: ${(item.analysis.dependencies||[]).join(', ')}
메서드: ${(item.analysis.methods||[]).join(', ')}
--- 스니펫 ---
${item.code.slice(0, 700)}`).join('\n\n');
}

function chatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
}

function appendMsg(role, content) {
  const body = document.getElementById('chat-body');
  const parts = content.split(/(```[\s\S]*?```)/g);
  let inner = '';

  parts.forEach(p => {
    if (p.startsWith('```')) {
      const code = p.replace(/```\w*\n?/, '').replace(/```$/, '').trim();
      const eid = 'mc' + Date.now() + Math.random().toString(36).slice(2, 7);
      inner += `<div class="msg-code" id="${eid}">${esc(code)}</div>
        <div class="msg-code-actions">
          <button class="code-act" onclick="copyEl('${eid}')">복사</button>
          <button class="code-act" onclick="codeToEditor('${eid}')">→ 에디터</button>
          <button class="code-act" onclick="codeToVerify('${eid}')">→ 검증</button>
        </div>`;
    } else if (p.trim()) {
      inner += `<p>${esc(p).replace(/\n/g,'<br>')}</p>`;
    }
  });

  const label = role === 'user' ? 'ME' : 'AI';
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.innerHTML = `<div class="avatar">${label}</div><div class="bubble">${inner}</div>`;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function copyEl(id) {
  navigator.clipboard.writeText(document.getElementById(id)?.textContent || '')
    .then(() => toast('코드 복사됨', 'ok'));
}
function codeToEditor(id) {
  const code = document.getElementById(id)?.textContent || '';
  document.getElementById('ed-code').value = code;
  syncLn(document.getElementById('ed-code'), 'ln-ed');
  switchTab(document.querySelector('[data-panel=editor]'), 'editor');
  toast('에디터로 전송됨');
}
function codeToVerify(id) {
  const code = document.getElementById(id)?.textContent || '';
  document.getElementById('vr-code').value = code;
  syncLn(document.getElementById('vr-code'), 'ln-vr');
  switchTab(document.querySelector('[data-panel=verify]'), 'verify');
  toast('검증 패널로 전송됨');
}

async function sendChat() {
  const inp = document.getElementById('chat-inp');
  const msg = inp.value.trim();
  if (!msg || isBusy) return;

  isBusy = true;
  inp.value = '';
  document.getElementById('send-btn').disabled = true;
  appendMsg('user', msg);
  chatHistory.push({ role: 'user', content: msg });

  // Loading indicator
  const body = document.getElementById('chat-body');
  const loadEl = document.createElement('div');
  loadEl.className = 'msg ai';
  loadEl.innerHTML = `<div class="avatar">AI</div><div class="bubble"><div class="dots"><span></span><span></span><span></span></div></div>`;
  body.appendChild(loadEl);
  body.scrollTop = body.scrollHeight;

  const kbCtx = buildKBCtx();
  try {
    const reply = await callClaude(
      chatHistory,
      `C# 코딩 전문가 에이전트입니다.
${kbCtx ? `\n=== 지식 베이스 (참조 필수) ===\n${kbCtx}\n===\n` : '지식 베이스가 비어 있습니다.'}
규칙: 지식 베이스 패턴·네이밍·DI 방식을 따르세요. 코드는 \`\`\`csharp 블록으로 감싸고, 설명은 간결하게.`,
      2500
    );
    loadEl.remove();
    appendMsg('ai', reply);
    chatHistory.push({ role: 'assistant', content: reply });
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
  } catch (e) {
    loadEl.remove();
    appendMsg('ai', '오류가 발생했습니다: ' + e.message);
  } finally {
    isBusy = false;
    document.getElementById('send-btn').disabled = false;
  }
}

// ── Verify ───────────────────────────────────
function loadEditorCode() {
  const code = document.getElementById('ed-code').value;
  document.getElementById('vr-code').value = code;
  syncLn(document.getElementById('vr-code'), 'ln-vr');
  toast('에디터에서 불러옴');
}

async function verifyCode() {
  const code = document.getElementById('vr-code').value.trim();
  if (!code) { toast('검증할 코드를 입력해주세요', 'err'); return; }

  const opts = {
    review: document.getElementById('o-review').checked,
    tests:  document.getElementById('o-tests').checked,
    bugs:   document.getElementById('o-bugs').checked,
    perf:   document.getElementById('o-perf').checked,
  };
  if (!Object.values(opts).some(Boolean)) { toast('옵션을 하나 이상 선택해주세요', 'err'); return; }

  setBtnLoading('v-spin', 'v-lbl', true, '검증 시작');
  document.getElementById('vbtn').disabled = true;

  const out = document.getElementById('vr-out');
  out.innerHTML = `<div class="empty-state"><div class="dots" style="justify-content:center"><span></span><span></span><span></span></div><p>분석 중...</p></div>`;

  const tasks = [
    opts.review && { key:'review', label:'Code Review',    badge:'review', prompt:`이 C# 코드를 리뷰하세요. 코드 품질, 가독성, SOLID 원칙을 분석하고 개선 제안을 주세요. 마지막에 "품질 점수: XX/100" 형식으로 점수를 포함하세요.` },
    opts.bugs   && { key:'bugs',   label:'Bug Analysis',   badge:'bugs',   prompt:`이 C# 코드의 잠재 버그, null 참조, 예외 처리 누락, 메모리 누수를 분석하고 수정 방법을 제시하세요.` },
    opts.perf   && { key:'perf',   label:'Performance',    badge:'perf',   prompt:`이 C# 코드의 성능 문제를 분석하세요. LINQ 최적화, 비동기 처리, 불필요한 할당, 캐싱 기회 등을 점검하세요.` },
    opts.tests  && { key:'tests',  label:'Unit Tests',     badge:'tests',  prompt:`이 C# 코드에 대한 xUnit 단위 테스트를 작성하세요. 정상, 엣지, 예외 케이스를 포함하고 \`\`\`csharp 블록으로 감싸세요.` },
  ].filter(Boolean);

  out.innerHTML = '';

  try {
    for (const task of tasks) {
      const reply = await callClaude(
        [{ role: 'user', content: `${task.prompt}\n\n\`\`\`csharp\n${code}\n\`\`\`` }],
        'C# 전문가입니다. 명확하고 실용적인 분석을 한국어로 제공하세요.',
        1800
      );

      const section = document.createElement('div');
      section.className = 'vr-section';

      // Score card for review
      let scoreHtml = '';
      if (task.key === 'review') {
        const m = reply.match(/품질 점수[:\s]*(\d+)/);
        if (m) {
          const s = parseInt(m[1]);
          const cls = s >= 80 ? '' : s >= 60 ? 'warn' : 'bad';
          scoreHtml = `<div class="score-row">
            <div class="score-box">
              <div class="score-num ${cls}">${s}</div>
              <div class="score-lbl">품질 점수</div>
            </div>
          </div>`;
        }
      }

      // Parse code blocks
      const parts = reply.split(/(```[\s\S]*?```)/g);
      let contentHtml = '';
      parts.forEach(p => {
        if (p.startsWith('```')) {
          const code = p.replace(/```\w*\n?/, '').replace(/```$/, '').trim();
          const bid = 'vc' + Date.now() + Math.random().toString(36).slice(2, 6);
          contentHtml += `<div class="vr-code-wrap">
            <pre class="vr-code" id="${bid}">${esc(code)}</pre>
            <button class="vr-copy-btn" onclick="copyEl('${bid}')">복사</button>
          </div>
          <div class="msg-code-actions" style="margin-top:4px">
            <button class="code-act" onclick="codeToEditor('${bid}')">→ 에디터로</button>
          </div>`;
        } else if (p.trim()) {
          contentHtml += `<div class="vr-text">${esc(p).replace(/\n/g,'<br>')}</div>`;
        }
      });

      section.innerHTML = `
        <div class="vr-section-hdr">
          <span class="vr-badge ${task.badge}">${task.label}</span>
        </div>
        ${scoreHtml}
        ${contentHtml}`;
      out.appendChild(section);
    }
    toast('검증 완료!', 'ok');
  } catch (e) {
    out.innerHTML = `<div class="empty-state"><p style="color:var(--red)">오류: ${esc(e.message)}</p></div>`;
    toast('검증 실패: ' + e.message, 'err');
  } finally {
    setBtnLoading('v-spin', 'v-lbl', false, '검증 시작');
    document.getElementById('vbtn').disabled = false;
  }
}

// ── Init ─────────────────────────────────────
loadKB();
