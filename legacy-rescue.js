const LEGACY_FUNCTION_URL='https://adofdnxbraakxynvclzd.supabase.co/functions/v1/threads-roster-bot'
function legacyToken(){const key=Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token'));const value=key?JSON.parse(localStorage.getItem(key)||'null'):null;const token=value?.access_token??value?.currentSession?.access_token;if(!token)throw new Error('管理者セッションがありません。');return token}
async function legacyInvoke(body){const response=await fetch(LEGACY_FUNCTION_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${legacyToken()}`},body:JSON.stringify(body)});let data={};try{data=await response.json()}catch{}if(!response.ok||data.ok!==true)throw new Error(data.error??`HTTP ${response.status}`);return data}
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))

function legacyCard(item,refresh){
  const card=document.createElement('article');card.className='notice';card.style.marginBottom='1rem'
  card.innerHTML=`<div class="row between"><h4>@${esc(item.username)}</h4><span class="status">${esc(item.identity_status)}</span></div>
    <p><a href="${esc(item.post_url)}" target="_blank" rel="noopener noreferrer">Threads投稿URLを開く</a><br>コメントID：<code>${esc(item.reply_id)}</code><br>ジョブID：<code>${esc(item.job_id)}</code><br>ジョブ：${esc(item.job_status)}／試行0回／送信履歴${Number(item.outbound_count)}件</p>
    <details><summary>本人申告・登録記録を確認</summary><pre>${esc((item.registration_evidence??[]).join('\n---\n')||'登録時記録なし')}</pre></details>
    <details><summary>返信本文を最終確認</summary><pre>${esc(item.reply_body)}</pre></details>
    <div class="row"><button class="verify secondary">本人確認を記録</button><button class="approve secondary">この1件の送信を承認</button><button class="send">承認済み1件を送信</button></div><pre class="result"></pre>`
  const result=card.querySelector('.result'),verify=card.querySelector('.verify'),approve=card.querySelector('.approve'),send=card.querySelector('.send')
  verify.disabled=item.identity_status!=='unverified';approve.disabled=item.identity_status!=='verified';send.disabled=item.identity_status!=='send_approved'
  verify.onclick=async()=>{const note=prompt('Threads投稿URL・表示ユーザー名・登録時本人申告を照合した根拠を入力してください。');if(!note)return;if(!confirm(`@${item.username} の本人確認を記録します。送信はまだ行いません。`))return;try{await legacyInvoke({action:'verify_legacy_rescue_identity',job_id:item.job_id,reply_id:item.reply_id,username:item.username,verification_method:'admin_threads_url_and_registration',verification_note:note,approval:'VERIFY_LEGACY_IDENTITY'});result.textContent='本人確認を記録しました。送信は未承認です。';await refresh()}catch(error){result.textContent=`本人確認を記録できません：${error.message}`}}
  approve.onclick=async()=>{if(!confirm(`宛先 @${item.username}\nコメントID ${item.reply_id}\n表示中の本文を1件限定送信対象として承認します。まだ送信しません。`))return;try{await legacyInvoke({action:'approve_legacy_rescue_send',job_id:item.job_id,reply_id:item.reply_id,username:item.username,approval:'APPROVE_LEGACY_SEND'});result.textContent='1件限定送信を承認しました。Threads送信はまだ0件です。';await refresh()}catch(error){result.textContent=`送信承認できません：${error.message}`}}
  send.onclick=async()=>{if(!confirm(`最終確認：@${item.username} のコメント ${item.reply_id} へ表示中の本文を1回だけ送信します。取り消せません。実行しますか？`))return;send.disabled=true;result.textContent='送信中です。再操作しないでください。';try{const value=await legacyInvoke({action:'send_legacy_rescue',job_id:item.job_id,reply_id:item.reply_id,username:item.username,approval:'SEND_LEGACY_RESCUE'});result.textContent=`送信成功\nThreads返信ID：${value.threads_reply_id??'記録済み'}\nこの許可は消費済みです。`;await refresh()}catch(error){result.textContent=`送信結果を成功確認できません：${error.message}\n再送しないでください。`}}
  return card
}

function injectLegacyRescue(){
  if(document.querySelector('#legacyRescuePanel'))return
  const anchor=document.querySelector('#botDraftsPanel')??document.querySelector('#botDiagnosticPanel');if(!anchor)return
  const panel=document.createElement('section');panel.className='panel';panel.id='legacyRescuePanel';panel.innerHTML='<h3>既存未返信コメント救済（部長確認・1件限定）</h3><div class="notice"><b>本人確認と送信承認は別操作です</b><p>社長本人の古い投稿、送信済み、試行済み、失敗・結果不明ジョブは表示しません。フェーズB/Cとは独立しています。</p></div><div class="row"><button id="refreshLegacyRescue" class="secondary">候補を更新</button></div><div id="legacyRescueList"><p>読み込み中…</p></div>'
  const list=panel.querySelector('#legacyRescueList')
  const refresh=async()=>{list.innerHTML='<p>候補を照合しています…</p>';try{const value=await legacyInvoke({action:'list_legacy_rescue_candidates'});list.innerHTML='';if(!value.candidates?.length){list.innerHTML='<p>安全条件を満たす未返信候補はありません。</p>';return}value.candidates.forEach(item=>list.append(legacyCard(item,refresh)))}catch(error){list.textContent=`候補取得失敗：${error.message}`}}
  panel.querySelector('#refreshLegacyRescue').onclick=refresh;anchor.before(panel);refresh()
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',injectLegacyRescue);else injectLegacyRescue()
new MutationObserver(injectLegacyRescue).observe(document.documentElement,{childList:true,subtree:true})
