const UNRESOLVED_URL='https://adofdnxbraakxynvclzd.supabase.co/functions/v1/threads-roster-unresolved-audit'
const unresolvedLabels={resolved:'対応済み・再送不要',resend_prohibited:'失敗・履歴要確認（再送禁止）',registration_wait:'名簿登録確認待ち',identity_wait:'本人確認待ち',roster_approval_wait:'名簿変更承認待ち',reply_approval_wait:'返信確認待ち',review_wait:'要確認'}

function unresolvedToken(){
  const key=Object.keys(localStorage).find(name=>name.startsWith('sb-')&&name.endsWith('-auth-token'))
  const value=key?JSON.parse(localStorage.getItem(key)||'null'):null
  const token=value?.access_token??value?.currentSession?.access_token
  if(!token)throw new Error('管理者セッションが見つかりません。再ログインしてください。')
  return token
}
function unresolvedEscape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function unresolvedInvoke(){
  const response=await fetch(UNRESOLVED_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${unresolvedToken()}`},body:JSON.stringify({action:'list_unresolved_member_cases'})})
  let data={};try{data=await response.json()}catch{}
  if(!response.ok||data.ok!==true)throw new Error(data.error??`HTTP ${response.status}`)
  return data
}
function unresolvedCard(item){
  const link=item.post_url?`<a href="${unresolvedEscape(item.post_url)}" target="_blank" rel="noopener">Threads投稿を開く</a>`:'投稿URL未取得'
  return `<article class="notice" style="margin:12px 0"><div class="row between"><b>@${unresolvedEscape(item.username)}</b><span class="status">${unresolvedEscape(unresolvedLabels[item.category]??item.category)}</span></div><p>${link}<br>コメントID：${unresolvedEscape(item.latest_inbound_id??'未取得')}<br>名簿：${item.registered?'登録あり':'未登録'} ／ 本人確認：${item.identity_verified?'確認済み':'未確認'} ／ ジョブ：${unresolvedEscape(item.job_status??'未生成')} ／ 試行：${item.attempts}回 ／ 送信履歴：${item.outbound_count}件</p>${item.latest_inbound_body?`<details><summary>最新コメント</summary><p>${unresolvedEscape(item.latest_inbound_body)}</p></details>`:''}<p><b>次の対応：</b>${unresolvedEscape(item.recommendation)}</p></article>`
}
function installUnresolvedPanel(){
  if(document.querySelector('#unresolvedMemberCasesPanel'))return
  const anchor=document.querySelector('#botDraftsPanel')??document.querySelector('#botDiagnosticPanel')
  if(!anchor)return
  const panel=document.createElement('section');panel.className='panel';panel.id='unresolvedMemberCasesPanel'
  panel.innerHTML='<h3>未対応15名の確認状況</h3><div class="notice"><b>読み取り専用</b><p>ジョブが未生成の人も表示します。この一覧から送信・名簿変更は行いません。失敗・送信済みは再送対象にしません。</p></div><div class="row"><button id="refreshUnresolvedCases" class="secondary">15名の状態を更新</button></div><p id="unresolvedCasesSummary">状態を取得しています…</p><div id="unresolvedCasesList"></div>'
  anchor.before(panel)
  const summary=panel.querySelector('#unresolvedCasesSummary'),list=panel.querySelector('#unresolvedCasesList')
  const refresh=async()=>{summary.textContent='15名を照合しています…';list.innerHTML='';try{const data=await unresolvedInvoke();const cases=data.cases??[];const counts={};cases.forEach(x=>counts[x.category]=(counts[x.category]??0)+1);summary.textContent=`表示 ${cases.length}/15名 ／ ${Object.entries(unresolvedLabels).map(([key,label])=>`${label} ${counts[key]??0}`).join(' ／ ')}`;for(const [key,label] of Object.entries(unresolvedLabels)){const items=cases.filter(x=>x.category===key);if(!items.length)continue;list.insertAdjacentHTML('beforeend',`<h4>${label}（${items.length}名）</h4>${items.map(unresolvedCard).join('')}`)}}catch(error){summary.textContent=`15名の取得に失敗：${error.message}`}}
  panel.querySelector('#refreshUnresolvedCases').onclick=refresh
  refresh()
}
const unresolvedObserver=new MutationObserver(()=>installUnresolvedPanel())
unresolvedObserver.observe(document.documentElement,{childList:true,subtree:true})
installUnresolvedPanel()
