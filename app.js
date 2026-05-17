// ═══════════════════════════════════════════
//   C# Knowledge Agent - app.js
// ═══════════════════════════════════════════

let knowledgeBase = [];
let chatHistory = [];
let modifyHistory = [];
let isLoading = false;

// ─── API Call ───────────────────────────────
async function callClaude(messages, system, maxTokens = 2000) {
  const apiKey = document.getElementById('api-key-input').value.trim();
  if (!apiKey) {
    showToast('API Key를 입력해주세요 (사이드바 하단)', 'error');
    throw new Error('No API Key');
  }

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    messages,
  };
  if (system) body.system = system;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${resp.status}`);
  }

  const data = await resp.json();
  return data.content?.find(b => b.type === 'text')?.text || '';
}

// ─── Panel Navigation ────────────────────────
function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('panel-' + name)?.classList.add('active');
  document.querySelector(`[data-panel="${name}"]`)?.classList.add('active');
}

// ─── Toast ───────────────────────────────────
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── Line Numbers ────────────────────────────
function updateLineNumbers(ta) {
  const lines = ta.value.split('\n').length;
  const lnEl = document.getElementById('line-numbers');
  lnEl.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}
function updateEditorLineNumbers(ta) {
  const lines = ta.value.split('\n').length;
  const lnEl = document.getElementById('editor-line-numbers');
  lnEl.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}
function updateVerifyLineNumbers(ta) {
  const lines = ta.value.split('\n').length;
  const lnEl = document.getElementById('verify-line-numbers');
  lnEl.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

// ─── Drag & Drop Upload ──────────────────────
const uploadZone = document.getElementById('upload-zone');
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});
uploadZone.addEventListener('click', () => document.getElementById('file-input').click());

async function handleFiles(files) {
  for (const file of Array.from(files)) {
    const text = await file.text();
    await processCodeEntry(file.name, text, 'upload');
  }
}

// ─── Analyze & Store ─────────────────────────
async function analyzeAndStore() {
  const code = document.getElementById('paste-code').value.trim();
  const filename = document.getElementById('paste-filename').value.trim() || 'Code.cs';
  if (!code) { showToast('코드를 입력해주세요', 'error'); return; }
  await processCodeEntry(filename, code, 'paste');
}

function setKBStatus(msg, type = '') {
  const el = document.getElementById('kb-analyze-status');
  el.textContent = msg;
  el.className = 'status-text ' + type;
}

async function processCodeEntry(filename, code, source) {
  setKBStatus('분석 중...', 'loading');
  document.querySelector('.paste-actions .btn-primary').disabled = true;

  try {
    const rawText = await callClaude(
      [{ role: 'user', content: `파일명: ${filename}\n\n코드:\n${code.substring(0, 4000)}` }],
      `C# 코드를 분석하고 반드시 JSON만 반환하세요. 마크다운 없이 순수 JSON만:
{
  "summary": "코드 역할 1~2줄",
  "type": "Service|Controller|Repository|Model|Interface|Utility|Other",
  "namespace": "네임스페이스",
  "mainClass": "주요 클래스명",
  "patterns": ["사용 패턴"],
  "dependencies": ["의존성"],
  "methods": ["주요 메서드 (최대5개)"]
}`,
      600
    );

    let analysis;
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      analysis = JSON.parse(cleaned);
    } catch {
      analysis = { summary: '분석 완료', type: 'Other', mainClass: filename.replace('.cs', ''), patterns: [], dependencies: [], methods: [] };
    }

    const entry = {
      id: Date.now() + Math.random(),
      filename,
      code,
      analysis,
      source,
      addedAt: new Date().toLocaleString('ko-KR'),
    };
    knowledgeBase.push(entry);
    saveKBToStorage();
    renderKBList();
    setKBStatus(`✓ '${filename}' 저장됨`, 'success');
    showToast(`'${filename}' 지식 저장 완료!`, 'success');

    if (source === 'paste') {
      document.getElementById('paste-code').value = '';
      document.getElementById('paste-filename').value = '';
      document.getElementById('paste-namespace').value = '';
      updateLineNumbers(document.getElementById('paste-code'));
    }
  } catch (e) {
    setKBStatus('오류: ' + e.message, 'error');
    showToast('분석 실패: ' + e.message, 'error');
  } finally {
    document.querySelector('.paste-actions .btn-primary').disabled = false;
  }
}

function clearPaste() {
  document.getElementById('paste-code').value = '';
  document.getElementById('paste-filename').value = '';
  document.getElementById('paste-namespace').value = '';
  updateLineNumbers(document.getElementById('paste-code'));
  setKBStatus('');
}

// ─── KB Render ───────────────────────────────
function renderKBList() {
  const list = document.getElementById('kb-list');
  const count = knowledgeBase.length;
  document.getElementById('kb-count-badge').textContent = count;
  document.getElementById('sidebar-kb-count').textContent = count;
  updateContextPanel();
  updateKBPills();

  if (!count) {
    list.innerHTML = '<div class="kb-empty"><div class="empty-icon">◈</div><p>아직 저장된 코드가 없습니다</p></div>';
    return;
  }

  list.innerHTML = knowledgeBase.map(item => `
    <div class="kb-card" id="kbc-${item.id}">
      <div class="kb-card-header">
        <span class="kb-card-name">${item.filename}</span>
        <span class="kb-card-type">${item.analysis.type || 'C#'}</span>
        <button class="kb-card-del" onclick="removeKB(${item.id})" title="삭제">✕</button>
      </div>
      <p class="kb-card-summary">${item.analysis.summary || ''}</p>
      <div class="kb-card-tags">
        ${(item.analysis.patterns || []).slice(0, 3).map(p => `<span class="kb-tag">${p}</span>`).join('')}
        ${(item.analysis.dependencies || []).slice(0, 2).map(d => `<span class="kb-tag">${d}</span>`).join('')}
      </div>
      <button class="kb-card-load" onclick="loadKBToEditor(${item.id})">→ 에디터로 불러오기</button>
    </div>
  `).join('');
}

function removeKB(id) {
  knowledgeBase = knowledgeBase.filter(i => i.id !== id);
  saveKBToStorage();
  renderKBList();
  showToast('삭제되었습니다');
}

function loadKBToEditor(id) {
  const item = knowledgeBase.find(i => i.id === id);
  if (!item) return;
  document.getElementById('editor-code').value = item.code;
  document.getElementById('editor-filename').value = item.filename;
  document.getElementById('editor-tab-name').textContent = item.filename;
  updateEditorLineNumbers(document.getElementById('editor-code'));
  showPanel('editor');
  showToast(`'${item.filename}' 에디터로 로드됨`);
}

function updateContextPanel() {
  const list = document.getElementById('context-list');
  if (!knowledgeBase.length) {
    list.innerHTML = '<p class="empty-small">지식 베이스가 비어 있습니다</p>';
    return;
  }
  list.innerHTML = knowledgeBase.map(item => `
    <div class="context-item">
      <div class="context-item-name">${item.filename}</div>
      <div class="context-item-type">${item.analysis.type || 'C#'}</div>
    </div>
  `).join('');
}

function updateKBPills() {
  const pills = document.getElementById('kb-pills');
  if (!knowledgeBase.length) { pills.innerHTML = ''; return; }
  pills.innerHTML = knowledgeBase.slice(0, 5).map(item =>
    `<span class="kb-pill">${item.filename}</span>`
  ).join('') + (knowledgeBase.length > 5 ? `<span class="kb-pill">+${knowledgeBase.length - 5}</span>` : '');
}

// ─── KB Storage ──────────────────────────────
function saveKBToStorage() {
  try {
    localStorage.setItem('csharp_kb', JSON.stringify(knowledgeBase));
  } catch {}
}

function loadKBFromStorage() {
  try {
    const saved = localStorage.getItem('csharp_kb');
    if (saved) {
      knowledgeBase = JSON.parse(saved);
      renderKBList();
    }
  } catch {}
}

function exportKB() {
  if (!knowledgeBase.length) { showToast('내보낼 지식이 없습니다', 'error'); return; }
  const json = JSON.stringify(knowledgeBase, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'csharp_knowledge_base.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('내보내기 완료!', 'success');
}

async function importKB(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      knowledgeBase = [...knowledgeBase, ...data];
      saveKBToStorage();
      renderKBList();
      showToast(`${data.length}개 지식 가져오기 완료!`, 'success');
    }
  } catch (e) {
    showToast('파일 형식 오류: ' + e.message, 'error');
  }
}

// ─── Code Editor ─────────────────────────────
function copyEditorCode() {
  const code = document.getElementById('editor-code').value;
  navigator.clipboard.writeText(code).then(() => showToast('클립보드에 복사됨!', 'success'));
}

function clearEditor() {
  document.getElementById('editor-code').value = '';
  updateEditorLineNumbers(document.getElementById('editor-code'));
}

function sendToAgent() {
  const code = document.getElementById('editor-code').value.trim();
  if (!code) { showToast('에디터에 코드를 입력해주세요', 'error'); return; }
  showPanel('agent');
  const input = document.getElementById('chat-input');
  input.value = `다음 코드를 분석하고 개선해주세요:\n\`\`\`csharp\n${code}\n\`\`\``;
}

function setModifyStatus(msg, type = '') {
  const el = document.getElementById('modify-status');
  el.textContent = msg;
  el.className = 'status-text ' + type;
}

async function modifyCode() {
  const code = document.getElementById('editor-code').value.trim();
  const prompt = document.getElementById('modify-prompt').value.trim();
  if (!code) { showToast('수정할 코드를 에디터에 입력해주세요', 'error'); return; }
  if (!prompt) { showToast('수정 요청을 입력해주세요', 'error'); return; }

  setModifyStatus('수정 중...', 'loading');
  document.querySelector('.modify-panel .btn-primary').disabled = true;

  // Save to history
  const historyEntry = { id: Date.now(), prompt, code, ts: new Date().toLocaleTimeString('ko-KR') };

  try {
    const kbCtx = buildKBContext();
    const result = await callClaude(
      [{ role: 'user', content: `수정 요청: ${prompt}\n\n현재 코드:\n\`\`\`csharp\n${code}\n\`\`\`` }],
      `당신은 C# 코드 수정 전문가입니다.
${kbCtx ? `\n=== 프로젝트 지식 베이스 ===\n${kbCtx}\n=== 끝 ===\n` : ''}
규칙:
- 요청에 맞게 코드를 정확히 수정하세요
- 지식 베이스가 있으면 해당 패턴과 네이밍 컨벤션을 따르세요
- 수정된 전체 코드를 \`\`\`csharp 블록으로 감싸 반환하세요
- 코드 앞뒤에 변경사항 요약을 한두 줄로 추가하세요`,
      2000
    );

    // Extract code from response
    const codeMatch = result.match(/```csharp\n?([\s\S]*?)```/);
    if (codeMatch) {
      historyEntry.newCode = codeMatch[1].trim();
      document.getElementById('editor-code').value = codeMatch[1].trim();
      updateEditorLineNumbers(document.getElementById('editor-code'));
    }

    historyEntry.result = result;
    modifyHistory.unshift(historyEntry);
    renderModifyHistory();
    setModifyStatus('✓ 수정 완료', 'success');
    document.getElementById('modify-prompt').value = '';
    showToast('코드 수정 완료!', 'success');
  } catch (e) {
    setModifyStatus('오류: ' + e.message, 'error');
    showToast('수정 실패: ' + e.message, 'error');
  } finally {
    document.querySelector('.modify-panel .btn-primary').disabled = false;
  }
}

function renderModifyHistory() {
  const list = document.getElementById('history-list');
  if (!modifyHistory.length) {
    list.innerHTML = '<p class="empty-small">아직 수정 내역이 없습니다</p>';
    return;
  }
  list.innerHTML = modifyHistory.slice(0, 10).map(h => `
    <div class="history-item" title="${h.prompt}">
      <span class="history-item-text">${h.ts} — ${h.prompt}</span>
      ${h.newCode ? `<button class="history-item-restore" onclick="restoreHistory(${h.id})">복원</button>` : ''}
    </div>
  `).join('');
}

function restoreHistory(id) {
  const h = modifyHistory.find(x => x.id === id);
  if (!h?.newCode) return;
  document.getElementById('editor-code').value = h.newCode;
  updateEditorLineNumbers(document.getElementById('editor-code'));
  showToast('이전 버전 복원됨');
}

// ─── AI Agent Chat ───────────────────────────
function buildKBContext() {
  if (!knowledgeBase.length) return '';
  return knowledgeBase.map(item => `
[${item.filename}] ${item.analysis.type} | ${item.analysis.mainClass}
요약: ${item.analysis.summary}
패턴: ${(item.analysis.patterns || []).join(', ')}
의존성: ${(item.analysis.dependencies || []).join(', ')}
주요 메서드: ${(item.analysis.methods || []).join(', ')}
--- 코드 스니펫 ---
${item.code.substring(0, 600)}
`).join('\n');
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
}

function appendChatMsg(role, content) {
  const area = document.getElementById('chat-messages');
  const avatar = role === 'user' ? 'ME' : 'AI';

  // Parse content: split into text and code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);
  let inner = '';
  parts.forEach(p => {
    if (p.startsWith('```')) {
      const lang = (p.match(/```(\w*)/)?.[1]) || '';
      const code = p.replace(/```\w*\n?/, '').replace(/```$/, '').trim();
      const eid = 'code-' + Date.now() + Math.random().toString(36).slice(2);
      inner += `<div class="msg-code" id="${eid}">${escHtml(code)}</div>
        <div class="msg-actions">
          <button class="msg-action-btn" onclick="copyCode('${eid}')">복사</button>
          <button class="msg-action-btn" onclick="sendCodeToEditor('${eid}')">→ 에디터</button>
          <button class="msg-action-btn" onclick="sendCodeToVerify('${eid}')">→ 검증</button>
        </div>`;
    } else {
      if (p.trim()) inner += `<p>${escHtml(p).replace(/\n/g, '<br>')}</p>`;
    }
  });

  const el = document.createElement('div');
  el.className = `chat-msg ${role}`;
  el.innerHTML = `<div class="msg-avatar">${avatar}</div><div class="msg-content">${inner}</div>`;
  area.appendChild(el);
  area.scrollTop = area.scrollHeight;
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function copyCode(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => showToast('코드 복사됨!', 'success'));
}

function sendCodeToEditor(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  document.getElementById('editor-code').value = el.textContent;
  updateEditorLineNumbers(document.getElementById('editor-code'));
  showPanel('editor');
  showToast('에디터로 전송됨');
}

function sendCodeToVerify(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  document.getElementById('verify-code').value = el.textContent;
  updateVerifyLineNumbers(document.getElementById('verify-code'));
  showPanel('verify');
  showToast('검증 패널로 전송됨');
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg || isLoading) return;

  isLoading = true;
  input.value = '';
  document.getElementById('send-btn').disabled = true;

  appendChatMsg('user', msg);
  chatHistory.push({ role: 'user', content: msg });

  // Loading indicator
  const area = document.getElementById('chat-messages');
  const loadEl = document.createElement('div');
  loadEl.className = 'chat-msg assistant';
  loadEl.innerHTML = `<div class="msg-avatar">AI</div><div class="msg-content"><div class="loading-dots"><span></span><span></span><span></span></div></div>`;
  area.appendChild(loadEl);
  area.scrollTop = area.scrollHeight;

  const kbCtx = buildKBContext();
  const system = `당신은 C# 코딩 전문가 에이전트입니다.
${kbCtx ? `\n=== 프로젝트 지식 베이스 (반드시 참조) ===\n${kbCtx}\n=== 끝 ===\n` : '지식 베이스가 비어 있습니다.'}

규칙:
- 지식 베이스에 코드가 있으면 해당 패턴, 네이밍 컨벤션, DI 방식을 따르세요
- 코드는 \`\`\`csharp 블록으로 감싸세요
- 실용적이고 즉시 사용 가능한 코드를 생성하세요
- 짧고 명확하게 설명하세요`;

  try {
    const reply = await callClaude(chatHistory, system, 2500);
    loadEl.remove();
    appendChatMsg('assistant', reply);
    chatHistory.push({ role: 'assistant', content: reply });
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
  } catch (e) {
    loadEl.remove();
    appendChatMsg('assistant', '오류가 발생했습니다: ' + e.message);
  } finally {
    isLoading = false;
    document.getElementById('send-btn').disabled = false;
  }
}

// ─── Verify ──────────────────────────────────
function loadFromEditor() {
  const code = document.getElementById('editor-code').value;
  document.getElementById('verify-code').value = code;
  updateVerifyLineNumbers(document.getElementById('verify-code'));
  showToast('에디터에서 불러옴');
}

async function verifyCode() {
  const code = document.getElementById('verify-code').value.trim();
  if (!code) { showToast('검증할 코드를 입력해주세요', 'error'); return; }

  const doReview = document.getElementById('opt-review').checked;
  const doTests = document.getElementById('opt-tests').checked;
  const doBugs = document.getElementById('opt-bugs').checked;
  const doPerf = document.getElementById('opt-perf').checked;

  if (!doReview && !doTests && !doBugs && !doPerf) {
    showToast('검증 옵션을 하나 이상 선택해주세요', 'error');
    return;
  }

  const btn = document.getElementById('verify-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';

  const output = document.getElementById('verify-output');
  output.innerHTML = '<div class="verify-placeholder"><div class="placeholder-icon">◎</div><p>분석 중...</p></div>';

  const tasks = [];
  if (doReview) tasks.push({ key: 'review', label: 'Code Review', badge: 'badge-review' });
  if (doBugs) tasks.push({ key: 'bugs', label: 'Bug Analysis', badge: 'badge-bug' });
  if (doPerf) tasks.push({ key: 'perf', label: 'Performance', badge: 'badge-perf' });
  if (doTests) tasks.push({ key: 'tests', label: 'Unit Tests', badge: 'badge-test' });

  const prompts = {
    review: `다음 C# 코드를 리뷰하세요. 코드 품질, 가독성, SOLID 원칙 준수 여부를 분석하고, 개선 제안을 포함하세요. 점수(0~100)를 마지막에 "점수: XX"로 표시하세요.`,
    bugs: `다음 C# 코드의 잠재적 버그, null 참조, 예외 처리 누락, 메모리 누수 등을 분석하세요. 발견된 문제를 목록으로 나열하고 수정 방법을 제시하세요.`,
    perf: `다음 C# 코드의 성능 문제를 분석하세요. LINQ 최적화, 비동기 처리, 캐싱 기회, 불필요한 할당 등을 점검하세요.`,
    tests: `다음 C# 코드에 대한 xUnit 단위 테스트를 작성하세요. 정상 케이스, 엣지 케이스, 예외 케이스를 포함하고 \`\`\`csharp 블록으로 감싸세요.`,
  };

  output.innerHTML = '';

  try {
    for (const task of tasks) {
      const result = await callClaude(
        [{ role: 'user', content: `${prompts[task.key]}\n\n코드:\n\`\`\`csharp\n${code}\n\`\`\`` }],
        '당신은 C# 전문가입니다. 명확하고 실용적인 분석을 제공하세요.',
        1800
      );

      const section = document.createElement('div');
      section.className = 'verify-section';

      // Score extraction for review
      let scoreHtml = '';
      if (task.key === 'review') {
        const scoreMatch = result.match(/점수[:\s]*(\d+)/);
        const score = scoreMatch ? parseInt(scoreMatch[1]) : null;
        if (score !== null) {
          const cls = score >= 80 ? '' : score >= 60 ? 'warn' : 'bad';
          scoreHtml = `
            <div class="score-grid">
              <div class="score-card">
                <div class="score-num ${cls}">${score}</div>
                <div class="score-label">코드 품질</div>
              </div>
            </div>`;
        }
      }

      // Check for code blocks in result
      const parts = result.split(/(```[\s\S]*?```)/g);
      let contentHtml = '';
      parts.forEach(p => {
        if (p.startsWith('```')) {
          const codeContent = p.replace(/```\w*\n?/, '').replace(/```$/, '').trim();
          const bid = 'vc-' + Date.now() + Math.random().toString(36).slice(2);
          contentHtml += `<div style="position:relative">
            <pre class="verify-code" id="${bid}">${escHtml(codeContent)}</pre>
            <button class="verify-copy-btn" onclick="copyCode('${bid}')">복사</button>
          </div>
          <div class="msg-actions" style="margin-top:4px">
            <button class="msg-action-btn" onclick="sendCodeToEditor('${bid}')">→ 에디터로</button>
          </div>`;
        } else if (p.trim()) {
          contentHtml += `<p class="verify-text">${escHtml(p).replace(/\n/g, '<br>')}</p>`;
        }
      });

      section.innerHTML = `
        <div class="verify-section-title">
          <span class="verify-badge ${task.badge}">${task.label}</span>
        </div>
        ${scoreHtml}
        ${contentHtml}
      `;
      output.appendChild(section);
    }
    showToast('검증 완료!', 'success');
  } catch (e) {
    output.innerHTML = `<div class="verify-placeholder"><p style="color:var(--danger)">오류: ${escHtml(e.message)}</p></div>`;
    showToast('검증 실패: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">◎</span> 검증 시작';
  }
}

// ─── Init ────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadKBFromStorage();

  // Tab sync
  document.getElementById('panel-agent').style.display = '';
  document.getElementById('panel-editor').style.display = '';
  document.getElementById('panel-verify').style.display = '';
});
