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

async function invoke(body){
  const response=await fetch(FUNCTION_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${sessionToken()}`},body:JSON.stringify(body)})
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

new MutationObserver(injectPanel).observe(document.documentElement,{childList:true,subtree:true})
injectPanel()
