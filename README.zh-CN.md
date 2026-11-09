<div align="center">

# portafs

_一条命令体检仓库里所有会在别的平台上出问题的文件名——大小写冲突、Windows 保留名、超长路径、Unicode 规范形冲突——把 checkout / CI 突然挂掉的事故拦在提交之前。_

[![node](https://img.shields.io/badge/node-%3E%3D18.17-blue)](package.json)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**`node bin/portafs.js check`** — 一条命令、零依赖、退出码可直接接门禁。

</div>

`portafs`（portable FS）是一个面向文件与目录名的命令行体检工具。在你机器上一切正常的仓库，换个人、换个系统可能根本克隆不下来：`README.md` 和 `readme.md` 在 Windows / macOS 上无法共存，`aux.c` 撞上 DOS 设备名，`report .md` 的尾部空格会被悄悄抹掉，NFC 与 NFD 两种写法的 `café.md` 在有的平台上会被当成同一个文件。portafs 用一条命令把这些问题全部找出来，赶在同事 checkout 或 CI 运行之前。

以下是一个包含 `README.md`、`readme.md`、`aux.c` 的仓库的真实输出（退出码 `1`）：

```text
portafs v0.1.0 — cross-platform filename audit
target: /tmp/portafs-demo
mode: filesystem
paths: 3


case-collision (2) — Paths differing only by letter case collide on case-insensitive file systems.
  README.md
    differs only by letter case from: readme.md
    hint: Rename so every name inside a directory is unique regardless of letter case — case-insensitive file systems (Windows, macOS by default) cannot store both.
  readme.md
    differs only by letter case from: README.md
    hint: Rename so every name inside a directory is unique regardless of letter case — case-insensitive file systems (Windows, macOS by default) cannot store both.

windows-reserved (1) — Windows reserves device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) even with an extension, e.g. aux.c.
  aux.c
    uses reserved Windows device name: "aux.c"
    hint: Windows cannot create files or folders named after devices (CON, PRN, AUX, NUL, COM1-9, LPT1-9) — with or without an extension. Choose a different name.

summary: 3 violation(s) across 2 rule(s) in 3 path(s)
```

## 安装

portafs **尚未发布到 npm**——npm 包与公开仓库将随首个版本一同上线。在此之前，请从源码检出运行：

```sh
git clone https://github.com/ecoreal/portafs
cd portafs
node bin/portafs.js check
```

npm 包发布后，本节将简化为 `npm install -g portafs`（或一次性 `npx portafs check`）。下文示例都以 `portafs` 指代命令；源码检出下请替换为 `node bin/portafs.js`。

需要 Node.js ≥ 18.17（与 [`engines`](package.json) 字段一致）。无需安装步骤、无需配置文件、全程不访问网络。

## 使用

### 快速上手

```sh
portafs check                 # 体检当前目录（git 感知）
portafs check path/to/repo    # 体检指定目录
portafs check --json          # 输出机器可读报告，便于脚本处理
portafs check --staged        # pre-commit：只审当前暂存的内容
```

npm 发布之前，源码检出下请以 `node bin/portafs.js …` 运行上述命令（见[安装](#安装)）。

### Git 感知扫描

- **默认**——目标位于 git 工作树内时，portafs 本地调用 `git ls-files`，只审追踪的文件。`node_modules`、构建产物、缓存等未跟踪内容天然不在范围内，暂存区中等待提交的文件也会被纳入。目录名由追踪的文件路径推导而来，所以目录级的问题同样逃不掉。
- **`--staged`**——只审暂存区里的新增与修改（`git diff --cached`），正合 pre-commit hook 的需要。暂存的删除不会被判违规。
- **仓库外**（或 git 不可用时）——自动回退为普通目录遍历，文件与目录全部纳入。符号链接会被列出但不会被跟随；不可读的目录直接跳过，不会让整个扫描失败。

### 基线工作流

老仓库、新门禁：先记录存量，之后只对新增亮红灯。

```sh
portafs baseline                                 # 生成 .portafs-baseline.json（恒退出 0，即使记录了违规）
portafs check --baseline .portafs-baseline.json  # 没有新增违规时退出码 0
```

- 把快照文件提交进仓库，让所有人和 CI 看到同一份基线。
- 两条违规的 ruleId 和 path 都相同才算"同一条"；细节变化不会复活已知的违规。
- 修掉违规后重新执行 `portafs baseline` 缩小快照。归零之后去掉 `--baseline`，全面生效。

### Pre-commit hook

```sh
#!/bin/sh
# npm 发布之前，把 hook 指向你的 portafs 检出目录
node /path/to/portafs/bin/portafs.js check --staged
```

### CI

```yaml
- uses: actions/checkout@v4
- run: node bin/portafs.js check --json   # npm 发布后可改用：npx portafs check --json
```

### 命令参考

```
portafs check [dir] [options]
portafs baseline [dir] [options]
```

| 选项 | 说明 |
| --- | --- |
| `--json` | 输出机器可读的 JSON 报告，替代文本。 |
| `--rule <id>` | 只运行指定规则（可重复）。可选 id：`case-collision`、`windows-reserved`、`trailing`、`path-length`、`unicode`。 |
| `--ignore <id>` | 跳过指定规则（可重复）。 |
| `--staged` | 只审暂存文件（git 模式；仓库外回退为全量扫描）。 |
| `--baseline <file>` | check 模式：只报快照之外的违规。 |
| `--output <file>` | baseline 模式：快照写入位置（默认 `.portafs-baseline.json`）。 |
| `--max-length <n>` | `path-length` 规则的路径长度阈值（默认 260；只计相对路径——深层 checkout 目录建议调低）。 |
| `--no-color` | 关闭 ANSI 颜色。非空的 `NO_COLOR` 环境变量效果相同。 |
| `-h`、`--help` | 显示帮助（退出码 0）。 |
| `--version` | 输出版本号（退出码 0）。 |

退出码：`0` 干净（或基线之外无新增）——注意 `baseline` 命令写入快照时恒为 `0`，即使快照中记录了违规；`1` 发现违规（仅 `check`）；`2` 用法或内部错误。

执行 `portafs --help` 可查看内置参考，其中包含上述内容以及每条规则的一行摘要。

### JSON 报告

`--json` 输出单个可被 `JSON.parse` 的文档；每条违规都带 `ruleId`、`path`、`detail`、`hint`（节选自上文演示仓库的真实输出）：

```json
{
  "tool": "portafs",
  "version": "0.1.0",
  "target": "/tmp/portafs-demo",
  "mode": "filesystem",
  "pathCount": 3,
  "summary": { "violations": 3, "byRule": { "case-collision": 2, "windows-reserved": 1 } },
  "violations": [
    {
      "ruleId": "windows-reserved",
      "path": "aux.c",
      "detail": "uses reserved Windows device name: \"aux.c\"",
      "hint": "Windows cannot create files or folders named after devices ..."
    }
  ]
}
```

`mode` 取值为 `filesystem`、`git-tracked` 或 `git-staged`。使用 `--baseline` 时会额外附带 `baseline` 对象（快照文件与其中的已知违规数），且 `violations` 只列新增违规。

## 扫描范围

每一条相对路径——文件**和**目录——都会经过五条规则：

| id | 捕获的问题 |
| --- | --- |
| `case-collision` | 仅大小写不同的路径（`README.md` 与 `readme.md`），含目录名。大小写不敏感的文件系统（Windows、默认配置的 macOS）无法同时存放。 |
| `windows-reserved` | 名为 `CON`、`PRN`、`AUX`、`NUL`、`COM1-9`、`LPT1-9` 的组件——带扩展名也算（`aux.c`）。无论作为文件还是目录，Windows 都创建不了。 |
| `trailing` | 以空格或点结尾的组件（`x `、`y.`）。Windows 创建时会抹掉它们，checkout 结果与仓库不一致。 |
| `path-length` | 超过阈值的相对路径（默认 260，可用 `--max-length` 调整）。加上 checkout 前缀后 Windows 的路径处理会失败；阈值本身只计相对路径，深层 checkout 目录建议调低。 |
| `unicode` | 共享同一 NFC 形式的不同路径（NFC 与 NFD 两种写法的 `café.md`）。在 Linux 上是两个文件，在别的平台可能并成一个。 |

范围说明：

- git 模式下扫描覆盖追踪（或暂存）的文件；祖先目录名由文件路径推导，因此即便 git 只列文件，保留名或大小写冲突的**目录**也会被抓出来。
- 规则是路径列表上的纯函数——不访问文件系统、不对文件内容做任何猜测。portafs 只读文件名，从不读文件内容。
- 选择机制是内置的：`--rule` 收窄、`--ignore` 跳过，每条违规都附带说明修法的 `hint`。

## 为什么做这个

不少工具都会碰文件名，但没有一个把**跨平台可移植性**当作仓库体检的一等公民。这张表尽量客观——每一种替代方案都擅长自己的本职：

| 方案 | 关注点 | 内置可移植性规则 | 问题在哪里暴露 |
| --- | --- | --- | --- |
| **portafs** | 文件名跨平台可移植性 | 大小写冲突、保留名、尾部空格/点、路径长度、NFC/NFD | 在作者机器上的 CI / pre-commit 中，推送之前 |
| [ls-lint](https://github.com/loeffel-io/ls-lint) | 命名规范（大小写风格、正则） | — | CI 中 |
| ESLint [`unicorn/filename-case`](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/filename-case.md) / Biome [`useFilenamingConvention`](https://biomejs.dev/linter/rules/use-filenaming-convention/) | 被 lint 的 JS/TS 文件的命名风格 | — | lint 运行时 |
| git 内建机制（[`core.protectNTFS`](https://git-scm.com/docs/git-config#Documentation/git-config.txt-coreprotectNTFS)、checkout 报错） | 保证 Windows 上 checkout 可用 | 保留名、尾部空格/点、非法字符；大小写冲突以 checkout 失败的形式暴露 | checkout 时，在下一个克隆者机器上 |
| [`sanitize-filename`](https://www.npmjs.com/package/sanitize-filename) 与 [`filename-reserved-regex`](https://github.com/sindresorhus/filename-reserved-regex) | 在应用代码里构造安全文件名 | 针对生成名字的保留名 / 非法字符 | 运行时逐个名字处理——不是仓库体检 |

简要地说：

- **命名规范工具**（ls-lint、ESLint、Biome）检查名字是否遵守你的风格指南。一个仓库可以全过规范检查，却照样藏着 `aux.c` 或一对 NFC/NFD。
- **git 内建机制**保护的是克隆者，意味着问题在被推送之后、由另一个平台上的同事在自己的机器上发现。`core.protectNTFS` 也只覆盖 Windows 特有的名称规则。
- **清洗类库**帮助"生成名字"的代码；它们不会审计已经提交的内容。
- 基于正则的 linter 可以用自定义规则近似部分可移植性检查；portafs 把上述五类问题做成开箱即用的内置规则，并配了 JSON 报告、退出码门禁和便于存量接入的基线模式。

## 开发

```sh
git clone https://github.com/ecoreal/portafs
cd portafs
npm test        # node --test，无参数，完全离线
```

- **零运行时依赖**——只用 Node.js ≥ 18.17 标准库（测试用 `node:test`）。
- fixture 全部在运行时于系统临时目录构造；测试不碰用户主目录、不访问网络，因此在 Linux、macOS、Windows 上行为一致（CI 会对三个平台分别验证）。
- 新增规则：创建 `src/rules/<id>.js`，导出 `{ id, description, hint, run(paths, options) -> violations[] }`，在 [`src/rules/index.js`](src/rules/index.js) 注册，在 `test/` 补测试，并更新本文件规则表与 [`src/cli.js`](src/cli.js) 中的 `USAGE`。完整指南见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 路线图

一些想法，顺序不分先后——目前均未实现：

- [ ] 忽略模式（glob）与配置文件，让团队不必依赖 `--ignore` 参数即可固化例外
- [ ] 更多规则：Windows 非法字符（`< > : " \| ? *`）、8.3 短文件名冲突、控制字符
- [ ] GitHub Annotations / SARIF 输出，让违规直接内联显示在 Pull Request 里
- [ ] `--fix` 模式，输出可直接执行的 `git mv` 命令
- [ ] 集成：husky / lefthook 片段、pre-commit framework hook、GitHub Action

对优先级有自己的看法？[提个 issue](https://github.com/ecoreal/portafs/issues)，或给现有的 issue 点个赞。

## 许可证

[MIT](LICENSE) © Jerry Lee (ecoreal)
