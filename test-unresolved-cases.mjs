import assert from 'node:assert/strict'
import fs from 'node:fs'

const edge=fs.readFileSync(new URL('./supabase/functions/threads-roster-unresolved-audit/index.ts',import.meta.url),'utf8')
const ui=fs.readFileSync(new URL('./unresolved-cases.js',import.meta.url),'utf8')
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8')

assert.match(edge,/await requireAdmin\(req\)/)
assert.match(edge,/list_unresolved_member_cases/)
assert.match(edge,/replies_sent:0/)
assert.match(edge,/username.*15|targets=\[/s)
assert.match(edge,/username match|ユーザー名一致|numericMatch/)
assert.match(edge,/\['failed','dead'\]/)
assert.match(edge,/resend_prohibited/)
assert.match(ui,/未対応15名の確認状況/)
assert.match(ui,/読み取り専用/)
assert.doesNotMatch(ui,/send_legacy_rescue|send_one_approved/)
assert.match(html,/unresolved-cases\.js\?v=unresolved-cases-v1/)
console.log('unresolved cases panel: 11 checks passed')
