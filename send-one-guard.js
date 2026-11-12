const FUNCTION_URL='https://adofdnxbraakxynvclzd.supabase.co/functions/v1/threads-roster-bot'
const TARGETS=[
  {jobId:'e70cd523-1a88-4708-be49-8039e9332f77',recipient:'@yatiyuinao',replyTo:'18128900158867058',body:`@yatiyuinao さん🎺

Threads吹奏楽部の登録情報はこちら！

🎼 仮登録：その他パーカッション

現在の内容を確認するため、メイン・サブ・過去に経験しただけの楽器を教えてください。

例：メインはフルート、サブはピッコロ、クラリネットは昔やっていました😊`},
  {jobId:'5520db7b-e5de-45d7-8781-49a0659bca44',recipient:'@springlives_',replyTo:'17909679606570073',body:`@springlives_ さん🎺

Threads吹奏楽部の登録情報はこちら！

🎼 メイン：チューバ
🎺 サブ候補：エレキベース
📝 候補：コントラバス、チューバ
🎷 経験：ピアノ、フルート

現在の内容を確認するため、メイン・サブ・過去に経験しただけの楽器を教えてください。

例：メインはフルート、サブはピッコロ、クラリネットは昔やっていました😊`},
]

function sessionToken(){
  const key=Object.keys(localStorage).find(name=>name.startsWith('sb-')&&name.endsWith('-auth-token'))
  if(!key)throw new Error('管理者セッションが見つかりません。再ログインしてください。')
  const stored=JSON.parse(localStorage.getItem(key)||'null')
  const token=stored?.access_token??stored?.currentSession?.access_token
  if(!token)throw new Error('管理者セッションを確認できません。再ログインしてください。')
  return token
}

async function invoke(body,{timeoutMs=0}={}){
  const controller=timeoutMs>0?new AbortController():null
  const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null
  let response
  try{response=await fetch(FUNCTION_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${sessionToken()}`},body:JSON.stringify(body),signal:controller?.signal})}
  finally{if(timer)clearTimeout(timer)}
  let data={};try{data=await response.json()}catch{}
  return{http:response.status,data}
}

function exactPreview(result,target){
  const value=result?.data
  return result.http===200&&value?.ok===true&&value.job_id===target.jobId&&value.status==='pending'&&value.eligible===true&&value.payload_complete===true&&value.duplicate_exists===false&&value.recipient===target.recipient&&value.reply_to_id===target.replyTo&&value.body===target.body&&value.paused===true&&value.auto_reply_enabled===false
}

function renderResult(node,result,target){
  const value=result?.data??{}
  node.textContent=[`HTTP：${result?.http??'不明'}`,`対象：${value.job_id??'不明'}`,`状態：${value.status??'不明'}`,`送信先：${value.recipient??'不明'}`,`返信先ID：${value.reply_to_id??'不明'}`,`重複履歴：${value.duplicate_exists===false?'なし':value.duplicate_exists===true?'あり':'不明'}`,`送信可否：${exactPreview(result,target)?'全条件一致':'送信不可'}`,value.error?`エラー：${value.error}`:''].filter(Boolean).join('\n')
}

function targetCard(target,index){
  const card=document.createElement('div');card.className='notice';card.style.marginBottom='1rem'
  card.innerHTML=`<h4>${index+1}. ${target.recipient}</h4><p>ジョブ ${target.jobId}<br>返信先 ${target.replyTo}</p><pre class="send-body"></pre><div class="row"><button class="queue secondary">承認キューへ</button><button class="preview secondary">最終確認</button><button class="send" disabled>この1件をThreadsへ送信</button></div><pre class="result notice">未確認です。</pre>`
  card.querySelector('.send-body').textContent=target.body
  const queueButton=card.querySelector('.queue'),previewButton=card.querySelector('.preview'),sendButton=card.querySelector('.send'),resultNode=card.querySelector('.result')
  let previewReady=false,busy=false

  queueButton.onclick=async()=>{
    if(busy)return
    busy=true;queueButton.disabled=true;previewButton.disabled=true;sendButton.disabled=true;resultNode.textContent='承認キューへ移動中…'
    try{
      const result=await invoke({action:'approve_one_for_send',job_id:target.jobId})
      resultNode.textContent=result.http===200&&result.data?.ok===true?`承認完了：${result.data.recipient} ／ 状態 ${result.data.status}\n次に「最終確認」を押してください。`:`承認できません：${result.data?.error??`HTTP ${result.http}`}`
    }catch(error){resultNode.textContent=`承認失敗：${error.message}`}
    finally{busy=false;queueButton.disabled=false;previewButton.disabled=false}
  }

  previewButton.onclick=async()=>{
    if(busy)return
    busy=true;previewReady=false;sendButton.disabled=true;previewButton.disabled=true;resultNode.textContent='確認中…'
    try{const result=await invoke({action:'preview_one_approved',job_id:target.jobId});renderResult(resultNode,result,target);previewReady=exactPreview(result,target);sendButton.disabled=!previewReady}
    catch(error){resultNode.textContent=`確認失敗：${error.message}`}
    finally{busy=false;previewButton.disabled=false}
  }

  sendButton.onclick=async()=>{
    if(busy||!previewReady)return
    busy=true;sendButton.disabled=true;previewReady=false
    try{
      const finalPreview=await invoke({action:'preview_one_approved',job_id:target.jobId})
      if(!exactPreview(finalPreview,target)){renderResult(resultNode,finalPreview,target);resultNode.textContent+='\n直前確認で不一致のため送信を中止しました。';return}
      if(!confirm(`${target.recipient} へ表示中の本文を1件送信します。\nジョブID：${target.jobId}\nこの操作は取り消せません。送信しますか？`)){resultNode.textContent='送信を取り消しました。';return}
      resultNode.textContent='送信中…再操作しないでください。'
      const result=await invoke({action:'send_one_approved',job_id:target.jobId,approval:'SEND_ONE_APPROVED'})
      resultNode.textContent=result.http===200&&result.data?.ok===true?`送信成功\nThreads返信ID：${result.data.threads_reply_id??'取得なし'}\nURL：${result.data.threads_permalink??'取得なし'}`:`送信は成功確認できません：${result.data?.error??`HTTP ${result.http}`}\n再送しないでください。`
    }catch(error){resultNode.textContent=`送信結果不明：${error.message}\n再送しないでください。`}
    finally{busy=false}
  }
  return card
}

function injectPanel(){
  if(document.querySelector('#sendOneApprovedPanel'))return
  const anchor=document.querySelector('#botDraftsPanel');if(!anchor)return
  const panel=document.createElement('section');panel.className='panel';panel.id='sendOneApprovedPanel'
  panel.innerHTML='<h3>限定送信（固定2件）</h3><p>各ジョブを個別に承認・最終確認・送信します。通常ポーリング、自動返信、他ジョブは実行しません。</p>'
  TARGETS.forEach((target,index)=>panel.append(targetCard(target,index)))
  anchor.before(panel)
}

function injectLatestTrialPanel(){
  if(document.querySelector('#latestAutoReplyTrialPanel'))return
  const anchor=document.querySelector('#botDiagnosticPanel')??document.querySelector('#botDraftsPanel')
  if(!anchor)return

  const panel=document.createElement('section')
  panel.className='panel'
  panel.id='latestAutoReplyTrialPanel'
  panel.innerHTML=`<h3>社長コメント1件限定試験（部長限定）</h3>
    <div class="notice"><b>開始操作ではThreads APIを呼びません</b>
    <p>試験開始から10分以内に、@shuhei5296 が投稿した「私の楽器は？」だけを次の取得対象にします。監視・Cron・自動返信は再開しません。</p></div>
    <div class="row"><button id="armLatestAutoReplyTrial">1件限定試験を開始</button><button id="prepareLatestAutoReplyTrial" class="secondary">投稿済みコメントを1回だけ取得</button><button id="previewLatestAutoReplyTrial" class="secondary">下書きを最終確認</button><button id="statusLatestAutoReplyTrial" class="secondary">送信状態を確認</button><button id="sendLatestAutoReplyTrial" disabled>この1件だけ送信</button></div>
    <pre id="latestAutoReplyTrialResult" class="result notice">未開始です。</pre>`

  const button=panel.querySelector('#armLatestAutoReplyTrial')
  const prepareButton=panel.querySelector('#prepareLatestAutoReplyTrial')
  const previewButton=panel.querySelector('#previewLatestAutoReplyTrial')
  const statusButton=panel.querySelector('#statusLatestAutoReplyTrial')
  const sendButton=panel.querySelector('#sendLatestAutoReplyTrial')
  const resultNode=panel.querySelector('#latestAutoReplyTrialResult')
  let busy=false,previewReady=false,trialReplyId=''
  const renderStatus=async(prefix='')=>{
    const result=await invoke({action:'get_one_auto_reply_trial_status',reply_id:trialReplyId})
    const value=result.data??{}
    if(result.http!==200||value.ok!==true)throw new Error(value.error??`HTTP ${result.http}`)
    trialReplyId=value.reply_to_id??trialReplyId
    previewReady=false;sendButton.disabled=true
    if(value.completed&&value.outbound_count===1){
      sendButton.textContent='送信済み';statusButton.disabled=false
      resultNode.textContent=`${prefix}送信完了をDB履歴で確認しました。\n送信件数：1件\nジョブ：${value.job_id}\nThreads返信ID：${value.threads_reply_id??'記録済み'}\n再送は禁止されています。\n自動返信OFF・監視停止を維持しています。`
      return value
    }
    if(value.outcome_unknown){
      sendButton.textContent='結果確認待ち';statusButton.disabled=false
      resultNode.textContent=`${prefix}送信結果は確定できません。\nジョブ状態：${value.job_status}\n自動再送は禁止されています。管理者がThreads上と監査ログを照合してください。`
      return value
    }
    if(value.job_status==='failed'){
      sendButton.textContent='送信失敗・再送禁止';statusButton.disabled=false
      resultNode.textContent=`${prefix}Threads APIが送信を拒否しました。\nジョブ状態：failed\n${value.last_error??''}\n自動再送は禁止されています。`
      return value
    }
    resultNode.textContent=`${prefix}送信は未完了です。\nジョブ状態：${value.job_status}\n試行回数：${value.attempts}\n状態確認では送信していません。`
    return value
  }
  button.onclick=async()=>{
    if(busy)return
    if(!confirm('10分間の1件限定試験を開始します。開始時点ではThreads APIを呼びません。実行しますか？'))return
    busy=true;button.disabled=true;resultNode.textContent='試験を開始しています…'
    try{
      const result=await invoke({action:'arm_latest_auto_reply_trial',approval:'ARM_LATEST_AUTO_REPLY'})
      const value=result.data??{}
      if(result.http!==200||value.ok!==true)throw new Error(value.error??`HTTP ${result.http}`)
      const started=value.auto_reply_trial_started_at
      const expires=value.auto_reply_trial_ends_at
      resultNode.textContent=`開始しました。\n開始：${started?new Date(started).toLocaleString('ja-JP'):'記録済み'}\n期限：${expires?new Date(expires).toLocaleString('ja-JP'):'開始から10分'}\nThreads API呼び出し：0回\n次に @shuhei5296 で「私の楽器は？」と投稿してください。`
    }catch(error){
      resultNode.textContent=`開始できません：${error.message}\nThreads APIは呼び出していません。`
      button.disabled=false
    }finally{busy=false;prepareButton.disabled=false}
  }
  prepareButton.onclick=async()=>{
    if(busy)return
    if(!confirm('Threads APIを1回だけ呼び、先頭1ページから社長本人の「私の楽器は？」を探します。実行しますか？'))return
    busy=true;button.disabled=true;prepareButton.disabled=true;resultNode.textContent='対象コメントを1回だけ取得しています…'
    try{
      const result=await invoke({action:'prepare_latest_auto_reply_trial',approval:'PREPARE_LATEST_AUTO_REPLY'})
      const value=result.data??{}
      if(result.http!==200||value.ok!==true)throw new Error(value.error??`HTTP ${result.http}`)
      trialReplyId=value.target_reply_id??''
      resultNode.textContent=`対象を固定し、下書きを生成しました。\n対象：${value.username??'@shuhei5296'}\n返信ID：${value.target_reply_id??'取得済み'}\nThreads API呼び出し：${value.api_calls??1}回\nThreadsへの送信：0回\nこの下書きはまだ送信されていません。`
    }catch(error){
      resultNode.textContent=`取得を安全停止しました：${error.message}\n追加取得・送信は行っていません。`
    }finally{busy=false;prepareButton.disabled=false}
  }
  previewButton.onclick=async()=>{
    if(busy)return
    busy=true;previewReady=false;sendButton.disabled=true;previewButton.disabled=true;resultNode.textContent='下書きと重複履歴を確認しています…'
    try{
      const result=await invoke({action:'preview_one_auto_reply_trial'})
      const value=result.data??{}
      if(result.http!==200||value.ok!==true||value.eligible!==true||value.duplicate_exists!==false||value.status!=='pending'||Number(value.attempts)!==0)throw new Error(value.error??'安全条件が一致しません')
      trialReplyId=value.reply_to_id??''
      previewReady=Boolean(trialReplyId&&value.recipient==='@shuhei5296'&&value.body)
      if(!previewReady)throw new Error('宛先・本文・返信IDを確認できません')
      resultNode.textContent=`送信前確認：全条件一致\n対象：${value.recipient}\n返信ID：${trialReplyId}\nジョブ：${value.job_id}\n試行回数：${value.attempts}\n重複履歴：なし\n\n--- 送信予定本文 ---\n${value.body}`
      sendButton.disabled=false
    }catch(error){resultNode.textContent=`送信不可：${error.message}`}
    finally{busy=false;previewButton.disabled=false}
  }
  statusButton.onclick=async()=>{
    if(busy)return
    busy=true;statusButton.disabled=true;resultNode.textContent='DBの送信履歴を確認しています…'
    try{await renderStatus()}
    catch(error){resultNode.textContent=`状態確認失敗：${error.message}\n送信は行っていません。再送しないでください。`}
    finally{busy=false;statusButton.disabled=false}
  }
  sendButton.onclick=async()=>{
    if(busy||!previewReady||!trialReplyId)return
    if(!confirm(`@shuhei5296 の返信ID ${trialReplyId} へ、表示中の下書きを1回だけ送信します。\n他のジョブは処理しません。送信しますか？`))return
    busy=true;previewReady=false;sendButton.disabled=true;resultNode.textContent='対象1件だけを送信中です。再操作しないでください…'
    try{
      const result=await invoke({action:'run_one_auto_reply_trial',reply_id:trialReplyId,approval:'RUN_ONE_AUTO_REPLY'},{timeoutMs:25000})
      const value=result.data??{}
      if(result.http!==200||value.ok!==true||value.replies_sent!==1)throw new Error(value.error??`HTTP ${result.http}`)
      resultNode.textContent=`限定送信成功\n送信件数：1件\nジョブ：${value.outcome?.job_id??'記録済み'}\nThreads返信ID：${value.outcome?.threads_reply_id??'記録済み'}\n試験後は自動返信OFF・監視停止へ戻しました。`
    }catch(error){
      resultNode.textContent=`画面への応答が途切れました。DB状態を照会しています…\n自動再送は行いません。`
      try{await renderStatus('画面応答タイムアウト後の照合：')}
      catch(statusError){resultNode.textContent=`送信結果を確認できません：${error.message}\n状態照会も失敗：${statusError.message}\n再送せず、管理者確認が必要です。`}
    }
    finally{busy=false}
  }
  anchor.before(panel)
}

new MutationObserver(()=>{injectPanel();injectLatestTrialPanel()}).observe(document.documentElement,{childList:true,subtree:true})
injectPanel()
injectLatestTrialPanel()
