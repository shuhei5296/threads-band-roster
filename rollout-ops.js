const ROLLOUT_FUNCTION_URL='https://adofdnxbraakxynvclzd.supabase.co/functions/v1/threads-roster-bot'

function rolloutSessionToken(){
  const key=Object.keys(localStorage).find(name=>name.startsWith('sb-')&&name.endsWith('-auth-token'))
  const stored=key?JSON.parse(localStorage.getItem(key)||'null'):null
  const token=stored?.access_token??stored?.currentSession?.access_token
  if(!token)throw new Error('管理者セッションが見つかりません。再ログインしてください。')
  return token
}

async function rolloutInvoke(body){
  const response=await fetch(ROLLOUT_FUNCTION_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${rolloutSessionToken()}`},body:JSON.stringify(body)})
  let data={};try{data=await response.json()}catch{}
  if(!response.ok||data.ok!==true)throw new Error(data.error??`HTTP ${response.status}`)
  return data
}

const fmt=value=>value?new Date(value).toLocaleString('ja-JP'):'—'
const names=value=>String(value??'').split(/[\s,、]+/).map(v=>v.trim().replace(/^@+/, '').toLowerCase()).filter(Boolean)

function rolloutPanel(){
  if(document.querySelector('#stagedRolloutOpsPanel'))return
  const anchor=document.querySelector('#botDraftsPanel')??document.querySelector('#botDiagnosticPanel')
  if(!anchor)return
  const panel=document.createElement('section');panel.className='panel';panel.id='stagedRolloutOpsPanel'
  panel.innerHTML=`<h3>段階的自動返信（部長限定）</h3>
    <div class="notice"><b>開始はフェーズごとの社長承認後のみ</b><p>画面表示と緊急停止はThreads送信APIを呼びません。開始前の既存ジョブは対象外です。</p></div>
    <pre id="rolloutStatus" class="result notice">状態を取得しています…</pre>
    <div class="row"><button id="refreshRollout" class="secondary">状態を更新</button><button id="emergencyStopRollout" class="secondary">緊急停止</button></div>
    <h4>フェーズB（最大5アカウント・5件・60分）</h4>
    <label>許可アカウント（カンマ区切り、1〜5件）<input id="phaseBAccounts" type="text" placeholder="shuhei5296"></label>
    <div class="row"><button id="startPhaseB">承認済みフェーズBを開始</button></div>
    <h4>フェーズC（通常運用の安全枠）</h4>
    <label>24時間の総送信上限 <input id="phaseCTotal" type="number" min="1" max="100" value="50"></label>
    <label>1時間の送信上限 <input id="phaseCHourly" type="number" min="1" max="25" value="10"></label>
    <div class="row"><button id="startPhaseC">承認済みフェーズCを開始</button></div>`
  const status=panel.querySelector('#rolloutStatus')
  const render=value=>{status.textContent=[
    `BOT：${value.paused?'停止':'稼働'} ／ 自動返信：${value.auto_reply_enabled?'ON':'OFF'} ／ 段階運用：${value.rollout_active?value.phase:'OFF'}`,
    `開始：${fmt(value.started_at)} ／ 終了：${fmt(value.ends_at)}`,
    `許可：${(value.allowed_usernames??[]).map(v=>`@${v}`).join('、')||'全登録部員（フェーズC）'}`,
    `送信：${value.sent_count??0}/${value.max_sends??0} ／ 時間枠：${value.hour_sent_count??0}/${value.hourly_max_sends??0}`,
    `API利用率：${value.last_usage_percent??'不明'}% ／ 連続失敗：${value.consecutive_failures??0}`,
    `最終監視：${fmt(value.last_poll_at)} ／ 有効Cron：${value.active_cron_count??0}`,
    `失敗ジョブ：${value.failed_jobs??0} ／ 結果確認待ち：${value.unknown_jobs??0}`,
    value.last_error?`最終エラー：${value.last_error}`:''
  ].filter(Boolean).join('\n')}
  const refresh=async()=>{status.textContent='状態を照会しています…';try{render(await rolloutInvoke({action:'get_staged_rollout_status'}))}catch(error){status.textContent=`状態照会失敗：${error.message}`}}
  panel.querySelector('#refreshRollout').onclick=refresh
  panel.querySelector('#emergencyStopRollout').onclick=async()=>{if(!confirm('段階運用・自動返信・監視Cronを直ちに停止しますか？'))return;try{render(await rolloutInvoke({action:'stop_staged_rollout',approval:'EMERGENCY_STOP'}))}catch(error){status.textContent=`緊急停止を確認できません：${error.message}`}}
  panel.querySelector('#startPhaseB').onclick=async()=>{
    const allowed=names(panel.querySelector('#phaseBAccounts').value)
    if(allowed.length<1||allowed.length>5){status.textContent='フェーズBは1〜5アカウントを指定してください。';return}
    if(!confirm(`フェーズBを60分開始します。\n許可：${allowed.map(v=>`@${v}`).join('、')}\n最大送信：5件\n開始しますか？`))return
    try{render(await rolloutInvoke({action:'start_staged_rollout',phase:'B',allowed_usernames:allowed,max_sends:5,duration_minutes:60,max_usage_percent:10,hourly_max_sends:5,approval:'START_PHASE_B'}))}catch(error){status.textContent=`開始できません：${error.message}`}
  }
  panel.querySelector('#startPhaseC').onclick=async()=>{
    const total=Number(panel.querySelector('#phaseCTotal').value),hourly=Number(panel.querySelector('#phaseCHourly').value)
    if(!confirm(`フェーズCを24時間開始します。\n総上限：${total}件／時間上限：${hourly}件\n全登録部員が対象です。開始しますか？`))return
    try{render(await rolloutInvoke({action:'start_staged_rollout',phase:'C',allowed_usernames:[],max_sends:total,duration_minutes:1440,max_usage_percent:10,hourly_max_sends:hourly,approval:'START_PHASE_C'}))}catch(error){status.textContent=`開始できません：${error.message}`}
  }
  anchor.before(panel);refresh()
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',rolloutPanel)
else rolloutPanel()
new MutationObserver(rolloutPanel).observe(document.documentElement,{childList:true,subtree:true})
