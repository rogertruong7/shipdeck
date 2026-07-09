import { execFile } from 'node:child_process'
import { userInfo } from 'node:os'

export function wakeSetupScript(rule: string): string {
  return [
    'f=$(/usr/bin/mktemp /private/tmp/shipdeck-sudoers.XXXXXX)',
    `printf '%s\\n' '${rule}' > "$f"`,
    'visudo -c -f "$f"',
    'install -m 440 -o root -g wheel "$f" /etc/sudoers.d/shipdeck',
    'rm "$f"',
  ].join(' && ')
}

export function enableWakeArming(): Promise<boolean> {
  const user = userInfo().username
  const rule = `${user} ALL=(root) NOPASSWD: /usr/bin/pmset schedule *`
  const script = wakeSetupScript(rule)
  const appleScriptArg = script.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return new Promise(resolve => {
    execFile('osascript', ['-e', `do shell script "${appleScriptArg}" with administrator privileges`], err => resolve(!err))
  })
}
