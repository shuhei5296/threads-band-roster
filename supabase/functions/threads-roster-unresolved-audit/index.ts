import {createClient} from 'npm:@supabase/supabase-js@2.118.0'

const supabaseUrl=Deno.env.get('SUPABASE_URL')??''
const anonKey=Deno.env.get('SUPABASE_ANON_KEY')??''
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}')
const adminKey=secretKeys.default??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??''
const db=createClient(supabaseUrl,adminKey,{auth:{persistSession:false}})
const cors={'Access-Control-Allow-Origin':'https://shuhei5296.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
const targets=['akemi.nakamura905','giyu_yua_','yurika6624','tantan71512','aya.yoko31','jade_stern1213','_satomi_27','kakachan1020','ryo_hasmt','rappa_hotaru','k.akemi1210','ayumi01791777','t.misty6987','springlives_','campdaisuki0126']
const normalize=(value='')=>value.trim().replace(/^@+/,'').toLowerCase()
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:cors})

async function requireAdmin(req:Request){
  const authorization=req.headers.get('authorization')??''
  if(!authorization.toLowerCase().startsWith('bearer ')||!anonKey)throw new Error('admin authentication required')
  const client=createClient(supabaseUrl,anonKey,{auth:{persistSession:false},global:{headers:{Authorization:authorization}}})
  const {data:{user},error}=await client.auth.getUser()
  if(error||!user)throw new Error('admin authentication required')
  const {data:admin,error:adminError}=await client.from('app_admins').select('user_id').eq('user_id',user.id).maybeSingle()
  if(adminError||!admin)throw new Error('admin permission required')
}

function latest<T extends Record<string,any>>(rows:T[],dateKey='created_at'){
  return [...rows].sort((a,b)=>String(b[dateKey]??'').localeCompare(String(a[dateKey]??'')))[0]??null
}

async function buildCases(){
  const [memberResult,inboundResult,jobResult,approvalResult]=await Promise.all([
    db.from('members').select('id,threads_id,threads_user_id,bot_verified_at,membership_status').in('threads_id',targets),
    db.from('bot_messages').select('id,threads_reply_id,parent_reply_id,threads_username,threads_user_id,body,threads_permalink,status,created_at,sent_at').eq('direction','inbound').in('threads_username',targets).order('created_at',{ascending:false}).limit(500),
    db.from('bot_jobs').select('id,status,attempts,last_error,payload,created_at,updated_at').order('created_at',{ascending:false}).limit(1000),
    db.from('bot_legacy_reply_approvals').select('job_id,reply_id,username,status,verification_method,verified_threads_user_id,verified_at,send_approved_at,updated_at').in('username',targets).order('updated_at',{ascending:false}).limit(200),
  ])
  for(const result of [memberResult,inboundResult,jobResult,approvalResult])if(result.error)throw result.error
  const members=memberResult.data??[],inbounds=inboundResult.data??[],jobs=jobResult.data??[],approvals=approvalResult.data??[]
  const memberIds=members.map(x=>x.id)
  const inboundIds=inbounds.map(x=>String(x.threads_reply_id??'')).filter(Boolean)
  const [outboundResult,correctionResult]=await Promise.all([
    inboundIds.length?db.from('bot_messages').select('id,parent_reply_id,threads_reply_id,status,sent_at,created_at').eq('direction','outbound').in('parent_reply_id',inboundIds).limit(500):Promise.resolve({data:[],error:null}),
    memberIds.length?db.from('bot_correction_requests').select('id,member_id,status,raw_text,requested_primary,requested_sub,requested_experienced,created_at,decided_at').in('member_id',memberIds).order('created_at',{ascending:false}).limit(200):Promise.resolve({data:[],error:null}),
  ])
  if(outboundResult.error)throw outboundResult.error
  if(correctionResult.error)throw correctionResult.error
  const outbounds=outboundResult.data??[],corrections=correctionResult.data??[]
  return targets.map(username=>{
    const member=members.find(x=>normalize(x.threads_id)===username)??null
    const userInbound=inbounds.filter(x=>normalize(x.threads_username)===username)
    const source=latest(userInbound)
    const sourceIds=new Set(userInbound.map(x=>String(x.threads_reply_id??'')))
    const sent=outbounds.filter(x=>sourceIds.has(String(x.parent_reply_id??''))&&x.status==='sent')
    const userJobs=jobs.filter(x=>sourceIds.has(String(x.payload?.reply_to_id??'')))
    const job=latest(userJobs,'updated_at')
    const approval=latest(approvals.filter(x=>normalize(x.username)===username),'updated_at')
    const correction=member?latest(corrections.filter(x=>x.member_id===member.id),'created_at'):null
    const numericMatch=Boolean(source?.threads_user_id&&member?.threads_user_id&&String(source.threads_user_id)===String(member.threads_user_id))
    const verifiedByAdmin=Boolean(approval?.verification_method&&['verified','send_approved','claimed','completed'].includes(String(approval.status)))
    const identityVerified=numericMatch||verifiedByAdmin
    const failed=Boolean(job&&(['failed','dead'].includes(job.status)||Number(job.attempts??0)>0||job.last_error))
    let category='review_wait',recommendation='部長が元コメントと名簿情報を確認してください。'
    if(sent.length){category='resolved';recommendation='送信履歴あり。再送しません。'}
    else if(failed){category='resend_prohibited';recommendation='失敗・試行済みのため自動再送禁止。Threads側履歴を照合してください。'}
    else if(!member){category='registration_wait';recommendation='名簿未登録。楽器情報を推測せず、登録状況を確認してください。'}
    else if(!identityVerified){category='identity_wait';recommendation='本人確認が必要です。ユーザー名一致だけでは送信しません。'}
    else if(correction?.status==='pending'){category='roster_approval_wait';recommendation='名簿変更の部長承認待ちです。'}
    else if(job?.status==='waiting_approval'||!job){category='reply_approval_wait';recommendation=job?'返信本文と送信を確認してください。':'返信ジョブ未生成。元コメントと会話状況を確認してください。'}
    return{username,category,recommendation,registered:Boolean(member),membership_status:member?.membership_status??null,numeric_id_present:Boolean(member?.threads_user_id),identity_verified:identityVerified,identity_method:numericMatch?'numeric_user_id':verifiedByAdmin?approval.verification_method:null,latest_inbound_id:source?.threads_reply_id??null,latest_inbound_body:source?.body??null,post_url:source?.threads_permalink??null,posted_at:source?.created_at??null,job_id:job?.id??null,job_status:job?.status??null,attempts:Number(job?.attempts??0),last_error:job?.last_error??null,outbound_count:sent.length,correction_status:correction?.status??null}
  })
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(req.method!=='POST')return json({ok:false,error:'method not allowed'},405)
  try{await requireAdmin(req)}catch(error){return json({ok:false,error:error instanceof Error?error.message:'admin authentication required'},403)}
  const input=await req.json().catch(()=>({}))
  if(input.action!=='list_unresolved_member_cases')return json({ok:false,error:'unknown action'},400)
  try{return json({ok:true,cases:await buildCases(),read_only:true,replies_sent:0})}
  catch(error){return json({ok:false,error:error instanceof Error?error.message:String(error),replies_sent:0},500)}
})
