const BOT_SUBMENU_KEY='threads-roster-bot-submenu-v1'
const botSubmenuItems=[
  ['overview','概要・監視'],
  ['replies','返信・送信'],
  ['rescue','未返信救済'],
  ['registration','新規登録'],
  ['corrections','訂正・本人確認']
]
function botPanelCategory(panel){
  const id=panel.id||'',title=panel.querySelector('h2,h3')?.textContent||''
  if(id==='registrationIntakePanel'||/新規登録受付/.test(title))return'registration'
  if(['legacyRescuePanel','unresolvedMemberCasesPanel'].includes(id)||/未返信|救済|未対応/.test(title))return'rescue'
  if(['sendOneApprovedPanel','latestAutoReplyTrialPanel','botDraftsPanel'].includes(id)||/返信下書き|限定送信|自動返信/.test(title))return'replies'
  if(id==='botCorrectionsPanel'||/本人申告|訂正|本人確認/.test(title))return'corrections'
  return'overview'
}
function showBotSubmenuCategory(content,category){
  content.querySelectorAll(':scope > section.panel').forEach(panel=>{
    if(panel.id==='botSubmenuPanel')return
    panel.hidden=botPanelCategory(panel)!==category
  })
  content.querySelectorAll('#botSubmenuPanel button[data-bot-submenu]').forEach(button=>{
    const active=button.dataset.botSubmenu===category
    button.classList.toggle('active',active)
    button.setAttribute('aria-selected',String(active))
  })
  localStorage.setItem(BOT_SUBMENU_KEY,category)
}
function installBotSubmenu(){
  const settings=document.querySelector('#botSettings'),content=settings?.closest('.content')
  if(!content)return
  let nav=content.querySelector('#botSubmenuPanel')
  if(!nav){
    nav=document.createElement('section');nav.id='botSubmenuPanel';nav.className='panel'
    nav.innerHTML=`<style>#botSubmenuPanel{position:sticky;top:0;z-index:5;padding:10px}#botSubmenuPanel .bot-submenu{display:flex;gap:8px;overflow-x:auto;padding:2px}#botSubmenuPanel button{white-space:nowrap}#botSubmenuPanel button.active{background:#0f6f5d;color:#fff}</style><div class="bot-submenu" role="tablist" aria-label="名簿BOTサブメニュー">${botSubmenuItems.map(([key,label])=>`<button type="button" class="secondary" role="tab" data-bot-submenu="${key}">${label}</button>`).join('')}</div>`
    const firstPanel=[...content.children].find(node=>node.matches?.('section.panel'))
    firstPanel?content.insertBefore(nav,firstPanel):content.prepend(nav)
    nav.addEventListener('click',event=>{const button=event.target.closest('[data-bot-submenu]');if(button)showBotSubmenuCategory(content,button.dataset.botSubmenu)})
  }
  const saved=localStorage.getItem(BOT_SUBMENU_KEY),category=botSubmenuItems.some(([key])=>key===saved)?saved:'overview'
  showBotSubmenuCategory(content,category)
}
let botSubmenuTimer
new MutationObserver(()=>{clearTimeout(botSubmenuTimer);botSubmenuTimer=setTimeout(installBotSubmenu,30)}).observe(document.documentElement,{childList:true,subtree:true})
installBotSubmenu()
