const FUNCTION_URL='https://adofdnxbraakxynvclzd.supabase.co/functions/v1/threads-roster-bot'
const JOB_ID='f1d7552b-e88f-4bb8-b439-419df287aeac'
const EXPECTED_RECIPIENT='@shuhei5296'
const EXPECTED_REPLY_TO='18174599281459630'
const EXPECTED_BODY=`@shuhei5296 さん🎺

Threads吹奏楽部の登録情報はこちら！

🎼 仮登録：オーボエ、和太鼓

現在の内容を確認するため、メイン・サブ・過去に経験しただけの楽器を教えてください。

例：メインはフルート、サブはピッコロ、クラリネットは昔やっていました😊`

let previewReady=false
let sending=false

function sessionToken(){
  const key=Object.keys(localStorage).find(name=>name.startsWith('sb-')&&name.endsWith('-auth-token'))
  if(!key)throw new Error('管理者セッションが見つかりません。再ログインしてください。')
  const stored=JSON.parse(localStorage.getItem(key)||'null')
  const token=stored?.access_token??stored?.currentSession?.access_token
  if(!token)throw new Error('管理者セッションを確認できません。再ログインしてください。')
  return token
}

async function invoke(body){
  const response=await fetch(FUNCTION_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${sessionToken()}`},
    body:JSON.stringify(body),
  })
  let data={}
  try{data=await response.json()}catch{}
  return{http:response.status,data}
}

function exactPreview(result){
  const value=result?.data
  return result.http===200&&value?.ok===true&&
    value.job_id===JOB_ID&&value.status==='pending'&&value.eligible===true&&
    value.payload_complete===true&&value.duplicate_exists===false&&
    value.recipient===EXPECTED_RECIPIENT&&value.reply_to_id===EXPECTED_REPLY_TO&&
    value.body===EXPECTED_BODY&&value.paused===true&&value.auto_reply_enabled===false
}

function renderResult(node,result){
  const value=result?.data??{}
  node.textContent=[
    `HTTP：${result?.http??'不明'}`,
    `対象：${value.job_id??'不明'}`,
    `状態：${value.status??'不明'}`,
    `送信先：${value.recipient??'不明'}`,
    `返信先ID：${value.reply_to_id??'不明'}`,
    `重複履歴：${value.duplicate_exists===false?'なし':value.duplicate_exists===true?'あり':'不明'}`,
    `送信可否：${exactPreview(result)?'全条件一致':'送信不可'}`,
    value.error?`エラー：${value.error}`:'',
  ].filter(Boolean).join('\n')
}

function injectPanel(){
  if(document.querySelector('#sendOneApprovedPanel'))return
  const anchor=document.querySelector('#botDraftsPanel')
  if(!anchor)return
  const panel=document.createElement('section')
  panel.className='panel'
  panel.id='sendOneApprovedPanel'
  panel.innerHTML=`
    <h3>限定送信（部長本人・1件のみ）</h3>
    <div class="notice">
      <b>対象ジョブ：${JOB_ID}</b>
      <p>送信先 ${EXPECTED_RECIPIENT} ／ 返信先 ${EXPECTED_REPLY_TO}</p>
      <pre id="sendOneBody"></pre>
    </div>
    <div class="row">
      <button id="previewOneApproved" class="secondary">対象を最終確認</button>
      <button id="sendOneApproved" disabled>この1件をThreadsへ送信</button>
    </div>
    <pre id="sendOneResult" class="notice">未確認です。先に「対象を最終確認」を押してください。</pre>
    <small>通常ポーリング・自動返信・他ジョブは実行しません。送信操作の自動再試行はありません。</small>`
  panel.querySelector('#sendOneBody').textContent=EXPECTED_BODY
  anchor.before(panel)

  const previewButton=panel.querySelector('#previewOneApproved')
  const sendButton=panel.querySelector('#sendOneApproved')
  const resultNode=panel.querySelector('#sendOneResult')

  previewButton.onclick=async()=>{
    previewReady=false
    sendButton.disabled=true
    previewButton.disabled=true
    resultNode.textContent='確認中…'
    try{
      const result=await invoke({action:'preview_one_approved',job_id:JOB_ID})
      renderResult(resultNode,result)
      previewReady=exactPreview(result)
      sendButton.disabled=!previewReady
    }catch(error){resultNode.textContent=`確認失敗：${error.message}`}
    finally{previewButton.disabled=false}
  }

  sendButton.onclick=async()=>{
    if(sending||!previewReady)return
    sending=true
    sendButton.disabled=true
    previewReady=false
    try{
      const finalPreview=await invoke({action:'preview_one_approved',job_id:JOB_ID})
      if(!exactPreview(finalPreview)){
        renderResult(resultNode,finalPreview)
        resultNode.textContent+='\n直前確認で不一致のため送信を中止しました。'
        return
      }
      const approved=confirm(`${EXPECTED_RECIPIENT} へ承認済み本文を1件送信します。\nジョブID：${JOB_ID}\nこの操作は取り消せません。送信しますか？`)
      if(!approved){resultNode.textContent='送信を取り消しました。';return}
      resultNode.textContent='送信中…再操作しないでください。'
      const result=await invoke({action:'send_one_approved',job_id:JOB_ID,approval:'SEND_ONE_APPROVED'})
      renderResult(resultNode,result)
      if(result.http===200&&result.data?.ok===true){
        resultNode.textContent+=`\n送信成功\nThreads返信ID：${result.data.threads_reply_id??'取得なし'}\nURL：${result.data.threads_permalink??'取得なし'}`
      }else resultNode.textContent+='\n送信は成功確認できません。再送しないでください。'
    }catch(error){resultNode.textContent=`送信結果不明：${error.message}\n再送しないでください。`}
    finally{sending=false}
  }
}

new MutationObserver(injectPanel).observe(document.documentElement,{childList:true,subtree:true})
injectPanel()
