# 翻译数据来源 / Source

本目录下的翻译数据（`zh-rCN`、`zh-rTW`、`ko-KR` 中的 CSV 文件，以及 `languages.json`）
来自 [PoeCharm2](https://github.com/Chuanhsing/PoeCharm2) 项目的 `Data/Translate` 目录，
版权归 PoeCharm2 的作者与贡献者所有。

- 上游仓库：https://github.com/Chuanhsing/PoeCharm2
- 复制自提交：`2b44c5780c6d39f52f5c95529a2b9536b85c152f`（2025-12-26）
- `languages.json` 即上游的 `Data/Translate.json`

The translation data in this directory comes from the `Data/Translate` directory of
[PoeCharm2](https://github.com/Chuanhsing/PoeCharm2) and remains the work of its authors
and contributors.

`*/POBT.csv` 是 POBT 自己补充的词条（上游没有的界面文字），不来自 PoeCharm2。
`*/POBT.csv` holds POBT's own entries, for text upstream lacks; it does not come from PoeCharm2.

`zh-rCN/POBT-items.csv` 同样是 POBT 自己的词条：物品提示框的文字，以及对 `statDescriptions.csv` 个别词条的更正
（例如伤害范围漏掉的 “-”）。文件按名称顺序读入，同一英文以先读到的为准，所以它的更正生效。
`zh-rCN/POBT-items.csv` is POBT's too: the Items tab's tooltip text, and fixes to a few lines of
`statDescriptions.csv` (such as damage ranges missing their "-"). Files load in name order and the first line for an
English text wins, so its fixes apply.
