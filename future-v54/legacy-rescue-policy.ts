export type LegacyRescueInput={username:string;memberRegistered:boolean;numericUserIdMatches:boolean;approvalStatus:string|null;verificationMethod:string|null;jobStatus:string|null;attempts:number;lastError:boolean;outboundSent:boolean;anotherJobProcessing:boolean;replyIdConfirmed:boolean;rosterCurrent:boolean;templateAllowed:boolean;duplicateForUser:boolean}
export type LegacyRescueCategory='auto_rescue_wait'|'identity_wait'|'reply_review_wait'|'failed_or_unknown'|'completed'|'no_rescue'

export function classifyLegacyRescue(input:LegacyRescueInput):LegacyRescueCategory{
  if(input.outboundSent||input.jobStatus==='completed')return'completed'
  if(input.username==='shuhei5296'||input.duplicateForUser)return'no_rescue'
  if(['failed','dead','processing'].includes(input.jobStatus??'')||input.attempts>0||input.lastError||input.anotherJobProcessing)return'failed_or_unknown'
  if(!input.memberRegistered||!input.replyIdConfirmed)return'identity_wait'
  const identityVerified=input.numericUserIdMatches||(['verified','send_approved'].includes(input.approvalStatus??'')&&['numeric_user_id','admin_threads_url_and_registration'].includes(input.verificationMethod??''))
  if(!identityVerified)return'identity_wait'
  if(!input.rosterCurrent||!input.templateAllowed||input.approvalStatus!=='send_approved')return'reply_review_wait'
  if(!['waiting_approval','pending'].includes(input.jobStatus??''))return'no_rescue'
  return'auto_rescue_wait'
}

export const canAutoRescue=(input:LegacyRescueInput)=>classifyLegacyRescue(input)==='auto_rescue_wait'
export function selectSingleAutoRescue<T extends LegacyRescueInput>(items:T[]):T|null{return items.filter(canAutoRescue).sort((a,b)=>a.username.localeCompare(b.username))[0]??null}
