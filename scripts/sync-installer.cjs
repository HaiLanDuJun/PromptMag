/**
 * scripts/sync-installer.cjs
 * 将 electron-builder 在 release/ 产出的最新 exe 自动同步更新到 installer/ 目录，
 * 并清理 installer/ 下旧版本的 exe，实现一键打包即更新 installer/ 内的 exe 文件。
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const version = pkg.version

const RELEASE_DIR = path.join(ROOT, 'release')
const INSTALLER_DIR = path.join(ROOT, 'installer')

if (!fs.existsSync(RELEASE_DIR)) {
  console.error(`[sync-installer] release 目录不存在: ${RELEASE_DIR}`)
  process.exit(1)
}

fs.mkdirSync(INSTALLER_DIR, { recursive: true })

const releaseFiles = fs.readdirSync(RELEASE_DIR)
const exeFiles = releaseFiles.filter((f) => f.endsWith('.exe'))

if (!exeFiles.length) {
  console.error('[sync-installer] release 目录下未找到任何 .exe 文件')
  process.exit(1)
}

console.log(`[sync-installer] 正在同步 v${version} exe 文件到 installer/ ...`)

// 清理 installer/ 中旧版本的同名类 exe
const oldFiles = fs.readdirSync(INSTALLER_DIR)
for (const f of oldFiles) {
  if (f.endsWith('.exe') && !f.includes(version)) {
    try {
      fs.unlinkSync(path.join(INSTALLER_DIR, f))
      console.log(`[sync-installer] 清理旧版本: installer/${f}`)
    } catch (e) {
      console.warn(`[sync-installer] 无法删除旧文件: ${f}`)
    }
  }
}

// 复制最新版本 exe 到 installer/
for (const f of exeFiles) {
  const src = path.join(RELEASE_DIR, f)
  const dst = path.join(INSTALLER_DIR, f)
  fs.copyFileSync(src, dst)
  const sizeMb = (fs.statSync(dst).size / (1024 * 1024)).toFixed(2)
  console.log(`[sync-installer] ✓ 已更新: installer/${f} (${sizeMb} MB)`)
}

console.log(`[sync-installer] 完成！installer/ 中的 .exe 已更新至最新版本 v${version}`)
