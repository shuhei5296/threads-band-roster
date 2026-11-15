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

function phaseBRequest(accounts,totalValue,hourlyValue){
  const allowed=[...new Set(names(accounts))]
  const total=Number(totalValue),hourly=Number(hourlyValue)
  if(allowed.length<1||allowed.length>5||allowed.some(v=>!/^[a-z0-9._]+$/.test(v)))throw new Error('有効な許可アカウントを1〜5名指定してください。')
  if(!Number.isInteger(total)||total<1||total>5||!Number.isInteger(hourly)||hourly<1||hourly>total)throw new Error('総上限は1〜5件、時間上限は1件以上かつ総上限以下にしてください。')
  return {action:'start_staged_rollout',phase:'B',allowed_usernames:allowed,max_sends:total,duration_minutes:60,max_usage_percent:10,hourly_max_sends:hourly,approval:'START_PHASE_B'}
}

function phaseCRequest(totalValue,hourlyValue){
  const total=Number(totalValue),hourly=Number(hourlyValue)
  if(!Number.isInteger(total)||total<1||total>100||!Number.isInteger(hourly)||hourly<1||hourly>total||hourly>25)throw new Error('総上限は1〜100件、時間上限は1〜25件かつ総上限以下にしてください。')
  return {action:'start_staged_rollout',phase:'C',allowed_usernames:[],max_sends:total,duration_minutes:1440,max_usage_percent:10,hourly_max_sends:hourly,approval:'START_PHASE_C'}
}

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
    <label>許可アカウント（カンマ区切り、1〜5件）<input id="phaseBAccounts" type="text" placeholder="example_user"></label>
    <label>総送信上限 <input id="phaseBTotal" type="number" min="1" max="5" step="1" value="2"></label>
    <label>1時間の送信上限 <input id="phaseBHourly" type="number" min="1" max="5" step="1" value="2"></label>
    <p>実施時間60分／監視15分間隔／API利用率10%以上で停止</p>
    <div class="row"><button id="startPhaseB">承認済みフェーズBを開始</button></div>
    <h4>フェーズC（登録部員全員・24時間限定実証）</h4>
    <p>対象：正式登録部員全員／許可リスト：なし／監視：15分間隔</p>
    <label>24時間の総送信上限 <input id="phaseCTotal" type="number" min="1" max="100" value="2"></label>
    <label>1時間の送信上限 <input id="phaseCHourly" type="number" min="1" max="25" value="2"></label>
    <p>API利用率10%以上・80016・送信結果不明・期限到達・送信上限到達で安全停止します。名簿訂正は部長承認が必要です。</p>
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
    const button=panel.querySelector('#startPhaseB')
    if(button.disabled)return
    let request
    try{
      request=phaseBRequest(panel.querySelector('#phaseBAccounts').value,panel.querySelector('#phaseBTotal').value,panel.querySelector('#phaseBHourly').value)
    }catch(error){status.textContent=error.message;return}
    const end=fmt(Date.now()+60*60_000)
    if(!confirm(`フェーズBを60分開始します。\n許可：${request.allowed_usernames.map(v=>`@${v}`).join('、')}\n総上限：${request.max_sends}件／時間上限：${request.hourly_max_sends}件\n終了予定（目安）：${end}\n自動返信をONにし、Threadsへ実際に返信します。開始しますか？`))return
    button.disabled=true
    try{
      const before=await rolloutInvoke({action:'get_staged_rollout_status'})
      if(before.paused!==true||before.auto_reply_enabled!==false||before.rollout_active!==false||before.active_cron_count!==0){
        render(before);status.textContent+='\n開始には停止・自動返信OFF・有効Cron 0件が必要です。';return
      }
      try{await rolloutInvoke(request)}catch(error){
        status.textContent=`開始要求の結果を確認できません：${error.message}。再操作前に「状態を更新」を押してください。`;return
      }
      const actual=await rolloutInvoke({action:'get_staged_rollout_status'})
      render(actual)
      const expected=JSON.stringify([...request.allowed_usernames].sort())
      if(actual.phase!=='B'||actual.paused!==false||actual.rollout_active!==true||actual.auto_reply_enabled!==true||
         actual.max_sends!==request.max_sends||actual.hourly_max_sends!==request.hourly_max_sends||
         JSON.stringify([...(actual.allowed_usernames??[])].sort())!==expected||
         !actual.cron_jobs?.some(j=>j.active&&j.jobname==='threads-roster-bot-poll'&&j.schedule==='*/15 * * * *')||
         !actual.cron_jobs?.some(j=>j.active&&j.jobname==='threads-roster-rollout-auto-stop'&&j.schedule==='* * * * *')){
        status.textContent+='\n指定条件での開始を確認できません。状態を確認してください。'
      }
    }catch(error){status.textContent=`状態を確認できません：${error.message}。再操作前に「状態を更新」を押してください。`}
    finally{button.disabled=false}
  }
  panel.querySelector('#startPhaseC').onclick=async()=>{
    const button=panel.querySelector('#startPhaseC')
    if(button.disabled)return
    let request
    try{request=phaseCRequest(panel.querySelector('#phaseCTotal').value,panel.querySelector('#phaseCHourly').value)}catch(error){status.textContent=error.message;return}
    const end=fmt(Date.now()+24*60*60_000)
    if(!confirm(`フェーズCを24時間開始します。\n対象：正式登録部員全員（許可リストなし）\n総上限：${request.max_sends}件／時間上限：${request.hourly_max_sends}件\n終了予定（目安）：${end}\n自動返信をONにし、Threadsへ実際に返信します。\nAPI利用率10%以上・80016・結果不明・期限・上限到達で停止します。開始しますか？`))return
    button.disabled=true
    try{
      const before=await rolloutInvoke({action:'get_staged_rollout_status'})
      if(before.paused!==true||before.auto_reply_enabled!==false||before.rollout_active!==false||before.active_cron_count!==0){
        render(before);status.textContent+='\n開始には停止・自動返信OFF・段階運用OFF・有効Cron 0件が必要です。';return
      }
      try{await rolloutInvoke(request)}catch(error){
        status.textContent=`開始要求の結果を確認できません：${error.message}。再操作前に「状態を更新」を押してください。`;return
      }
      const actual=await rolloutInvoke({action:'get_staged_rollout_status'})
      render(actual)
      const endsAt=Date.parse(actual.ends_at),startedAt=Date.parse(actual.started_at)
      const durationOk=Number.isFinite(endsAt)&&Number.isFinite(startedAt)&&Math.abs((endsAt-startedAt)-24*60*60_000)<60_000
      if(actual.phase!=='C'||actual.paused!==false||actual.rollout_active!==true||actual.auto_reply_enabled!==true||
         actual.max_sends!==request.max_sends||actual.hourly_max_sends!==request.hourly_max_sends||
         (actual.allowed_usernames??[]).length!==0||!durationOk||
         !actual.cron_jobs?.some(j=>j.active&&j.jobname==='threads-roster-bot-poll'&&j.schedule==='*/15 * * * *')||
         !actual.cron_jobs?.some(j=>j.active&&j.jobname==='threads-roster-rollout-auto-stop'&&j.schedule==='* * * * *')){
        status.textContent+='\n指定条件での開始を確認できません。成功とは扱わず、状態を確認してください。'
      }else{
        status.textContent+='\nフェーズC開始を本番設定・Cron・自動返信状態まで照合しました。'
      }
    }catch(error){status.textContent=`状態を確認できません：${error.message}。再操作前に「状態を更新」を押してください。`}
    finally{button.disabled=false}
  }
  anchor.before(panel);refresh()
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',rolloutPanel)
else rolloutPanel()
new MutationObserver(rolloutPanel).observe(document.documentElement,{childList:true,subtree:true})
