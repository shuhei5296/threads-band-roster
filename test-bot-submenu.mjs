import assert from'node:assert/strict'
import fs from'node:fs'
const source=fs.readFileSync(new URL('./bot-submenu.js',import.meta.url),'utf8')
const checks=[/概要・監視/,/返信・送信/,/未返信救済/,/新規登録/,/訂正・本人確認/,/registrationIntakePanel/,/legacyRescuePanel/,/unresolvedMemberCasesPanel/,/sendOneApprovedPanel/,/botCorrectionsPanel/,/panel\.hidden=/,/localStorage\.setItem/,/aria-selected/]
for(const pattern of checks)assert.match(source,pattern)
console.log(`bot submenu: ${checks.length}/${checks.length} checks passed`)
