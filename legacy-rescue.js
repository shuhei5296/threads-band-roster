const LEGACY_FUNCTION_URL='https://adofdnxbraakxynvclzd.supabase.co/functions/v1/threads-roster-bot'
function legacyToken(){const key=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));const value=key?JSON.parse(localStorage.getItem(key)||'null'):null;const token=value?.access_token??value?.currentSession?.access_token;if(!token)throw new Error('管理者セッションがありません。');return token}
async function legacyInvoke(body){const response=await fetch(LEGACY_FUNCTION_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${legacyToken()}`},body:JSON.stringify(body)});let data={};try{data=await response.json()}catch{}if(!response.ok||data.ok!==true)throw new Error(data.error??`HTTP ${response.status}`);return data}
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
const legacyCandidateIds=new Set()

function protectLegacyDraftButtons(){
  document.querySelectorAll('[data-approve-draft]').forEach(button=>{
    if(!legacyCandidateIds.has(button.dataset.approveDraft))return
    if(button.disabled&&button.textContent==='下の専用救済欄で本人確認してください')return
    button.disabled=true
    button.textContent='下の専用救済欄で本人確認してください'
    button.title='この操作は旧キューへ直接移動するため、救済対象では使用しません。'
  })
}

function legacyStage(item){
  if(item.identity_status==='verified')return '本人確認済み・送信未承認'
  if(item.identity_status==='send_approved')return '本人確認済み・1件限定送信承認済み'
  if(['claimed','unknown','rejected','consumed','revoked'].includes(item.identity_status))return item.identity_status
  const oldButton=document.querySelector(`[data-approve-draft="${CSS.escape(item.job_id)}"]`)
  return oldButton?'本人確認未実施（旧下書き）':'旧キュー移行済み・本人確認未実施'
}

function legacyCategory(item){
  if(item.rescue_category)return item.rescue_category
  if(item.identity_status==='send_approved')return'auto_rescue_wait'
  if(item.identity_status==='verified')return'reply_review_wait'
  if(['claimed','unknown','rejected'].includes(item.identity_status))return'failed_or_unknown'
  if(item.identity_status==='consumed')return'completed'
  return'identity_wait'
}

const legacyCategoryLabels={
  auto_rescue_wait:'自動救済待ち',identity_wait:'本人確認待ち',reply_review_wait:'返信文確認待ち',
  failed_or_unknown:'送信失敗・結果不明',completed:'救済完了',no_rescue:'救済不要',investigate:'要調査',
}

function legacyCard(item,refresh){
  const card=document.createElement('article');card.className='notice';card.style.marginBottom='1rem'
  card.innerHTML=`<div class="row between"><h4>@${esc(item.username)}</h4><span class="status">${esc(legacyStage(item))}</span></div>
    <p><a href="${esc(item.post_url)}" target="_blank" rel="noopener noreferrer">Threads投稿URLを開く</a><br>コメントID：<code>${esc(item.reply_id)}</code><br>ジョブID：<code>${esc(item.job_id)}</code><br>試行0回／送信履歴${Number(item.outbound_count)}件</p>
    <details><summary>本人申告・登録記録を確認</summary><pre>${esc((item.registration_evidence??[]).join('\n---\n')||'登録時記録なし')}</pre></details>
    <details><summary>返信本文を最終確認</summary><pre>${esc(item.reply_body)}</pre></details>
    <div class="row"><button class="verify secondary">本人確認を記録</button><button class="approve secondary">この1件の送信を承認</button><button class="send">承認済み1件を送信</button></div><pre class="result"></pre>`
  const result=card.querySelector('.result'),verify=card.querySelector('.verify'),approve=card.querySelector('.approve'),send=card.querySelector('.send')
  verify.hidden=item.identity_status!=='unverified';approve.hidden=item.identity_status!=='verified';send.hidden=item.identity_status!=='send_approved'
  verify.onclick=async()=>{const note=prompt('Threads投稿URL・表示ユーザー名・登録時本人申告を照合した根拠を入力してください。');if(!note)return;if(!confirm(`@${item.username} の本人確認を記録します。送信はまだ行いません。`))return;try{await legacyInvoke({action:'verify_legacy_rescue_identity',job_id:item.job_id,reply_id:item.reply_id,username:item.username,verification_method:'admin_threads_url_and_registration',verification_note:note,approval:'VERIFY_LEGACY_IDENTITY'});result.textContent='本人確認を記録しました。送信は未承認です。';await refresh()}catch(error){result.textContent=`本人確認を記録できません：${error.message}`}}
  approve.onclick=async()=>{if(!confirm(`宛先 @${item.username}\nコメントID ${item.reply_id}\n表示中の本文を1件限定送信対象として承認します。まだ送信しません。`))return;try{await legacyInvoke({action:'approve_legacy_rescue_send',job_id:item.job_id,reply_id:item.reply_id,username:item.username,approval:'APPROVE_LEGACY_SEND'});result.textContent='1件限定送信を承認しました。Threads送信はまだ0件です。';await refresh()}catch(error){result.textContent=`送信承認できません：${error.message}`}}
  send.onclick=async()=>{if(!confirm(`最終確認：@${item.username} のコメント ${item.reply_id} へ表示中の本文を1回だけ送信します。取り消せません。実行しますか？`))return;send.disabled=true;result.textContent='送信中です。再操作しないでください。';try{const value=await legacyInvoke({action:'send_legacy_rescue',job_id:item.job_id,reply_id:item.reply_id,username:item.username,approval:'SEND_LEGACY_RESCUE'});result.textContent=`送信成功\nThreads返信ID：${value.threads_reply_id??'記録済み'}\nこの許可は消費済みです。`;await refresh()}catch(error){result.textContent=`送信結果を成功確認できません：${error.message}\n再送しないでください。`}}
  return card
}

function injectLegacyRescue(){
  if(document.querySelector('#legacyRescuePanel'))return
  const anchor=document.querySelector('#botDraftsPanel')??document.querySelector('#botDiagnosticPanel');if(!anchor)return
  const panel=document.createElement('section');panel.className='panel';panel.id='legacyRescuePanel';panel.innerHTML='<h3>既存未返信コメント救済（部長確認・自動救済準備）</h3><div class="notice"><b>本人確認・返信文確認・送信承認は別段階です</b><p>本人照合済み・未試行・未送信・承認済み定型文だけが自動救済対象です。数値ID未確認、未登録、failed／dead、社長本人の重複は自動送信しません。通常フェーズB/Cとは独立した送信枠です。</p></div><div class="row"><button id="refreshLegacyRescue" class="secondary">候補を更新</button><button id="startLegacyRescue">承認済み救済を開始</button><button id="stopLegacyRescue" class="secondary">救済を緊急停止</button></div><div id="legacyRescueRuntime" class="notice">救済稼働状態を確認しています…</div><div id="legacyRescueSummary" class="notice">状態を集計しています…</div><div id="legacyRescueList"><p>読み込み中…</p></div>'
  const list=panel.querySelector('#legacyRescueList')
  const summary=panel.querySelector('#legacyRescueSummary')
  const refresh=async()=>{list.innerHTML='<p>候補を照合しています…</p>';summary.textContent='状態を集計しています…';try{const value=await legacyInvoke({action:'list_legacy_rescue_candidates'});list.innerHTML='';legacyCandidateIds.clear();const candidates=value.candidates??[];candidates.forEach(item=>legacyCandidateIds.add(item.job_id));protectLegacyDraftButtons();const counts={};candidates.forEach(item=>{const category=legacyCategory(item);counts[category]=(counts[category]??0)+1});summary.textContent=Object.entries(legacyCategoryLabels).map(([key,label])=>`${label}：${counts[key]??0}件`).join(' ／ ')+(candidates.some(item=>item.rescue_category)?'':'\n※v53公開APIで安全候補として確認できた範囲のみ。失敗・完了・救済不要の全件分類は次期Edge反映後に表示します。');if(value.diagnostics?.partial){const warning=document.createElement('p');warning.className='notice';warning.textContent=`候補は部分取得です。確認済み ${value.diagnostics.checked_count-value.diagnostics.failed_count}件／未確認 ${value.diagnostics.failed_count}件（${Object.entries(value.diagnostics.error_codes??{}).map(([code,count])=>`${code}:${count}`).join('、')||'原因不明'}）`;list.append(warning)}if(!candidates.length){const empty=document.createElement('p');empty.textContent=value.diagnostics?.partial?'正常確認できた候補はありません。未確認分を0件として扱わないでください。':'安全条件を満たす未返信候補はありません。旧「送信承認キューへ」は使用せず、候補を更新してください。';list.append(empty);return}for(const [key,label] of Object.entries(legacyCategoryLabels)){const items=candidates.filter(item=>legacyCategory(item)===key);if(!items.length)continue;const heading=document.createElement('h4');heading.textContent=`${label}（${items.length}件）`;list.append(heading);items.forEach(item=>list.append(legacyCard(item,refresh)))}}catch(error){summary.textContent='集計できませんでした。';list.textContent=`候補取得失敗：${error.message}`}}
  const runtime=panel.querySelector('#legacyRescueRuntime');const status=async()=>{try{const s=await legacyInvoke({action:'get_legacy_rescue_status'});runtime.textContent=`救済：${s.active?'稼働中':'停止'} ／ 送信 ${s.sent_count??0}/${s.max_sends??0} ／ 時間枠 ${s.hour_sent_count??0}/${s.hourly_max_sends??0} ／ API ${s.last_usage_percent??0}% ／ 最終停止 ${s.stop_reason??'なし'}`}catch(error){runtime.textContent=`救済状態を取得できません：${error.message}`}}
  panel.querySelector('#startLegacyRescue').onclick=async()=>{if(!confirm('対象は本人確認・本文承認済みだけです。総上限1件、時間上限1件、60分でThreadsへ実際に返信します。開始しますか？'))return;try{await legacyInvoke({action:'start_legacy_rescue',max_sends:1,hourly_max_sends:1,duration_minutes:60,approval:'START_LEGACY_RESCUE'});await status()}catch(error){alert(`開始できません：${error.message}`)}}
  panel.querySelector('#stopLegacyRescue').onclick=async()=>{if(!confirm('未返信救済を緊急停止しますか？'))return;try{await legacyInvoke({action:'stop_legacy_rescue',approval:'EMERGENCY_STOP'});await status()}catch(error){alert(`停止できません：${error.message}`)}}
  panel.querySelector('#refreshLegacyRescue').onclick=async()=>{await refresh();await status()};anchor.before(panel);refresh();status()
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',injectLegacyRescue);else injectLegacyRescue()
new MutationObserver(()=>{injectLegacyRescue();protectLegacyDraftButtons()}).observe(document.documentElement,{childList:true,subtree:true})
