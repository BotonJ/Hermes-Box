# FEAT: 修复审批声音预览

**日期**：2026-05-12
**状态**：完成
**标签**：`hermes-box-v2` | `sound` | `bugfix`

---

## 背景

用户在 Settings 中选择不同的系统声音，点击 Preview 时听到的都是同一个声音。

## 问题分析

### 根因：SoundPicker 使用 localStorage 直接读取，无状态管理

```tsx
// 旧代码：value 是 prop，从 localStorage 读取
<SoundPicker
  value={getClaudeSound()}  // ← 渲染时读取，之后不会更新
  onChange={setClaudeSound} // ← 写入 localStorage，但组件不重新渲染
/>
```

`handlePreview` 中的 `value` 参数永远是**旧值**，不是用户刚选的声音。

### 附加问题：CSP 阻止 HTMLAudioElement 加载本地文件

`tauri.conf.json` 的 CSP 不允许 `file://` 协议。

## 修复内容

### 1. CSP 添加 media-src 允许

`src-tauri/tauri.conf.json`：
```json
"csp": "default-src 'self'; media-src 'self' file:; ..."
```

### 2. Rust 添加 play_sound 命令

`src-tauri/src/approval.rs`：
```rust
#[tauri::command]
pub fn play_sound(sound_name: String) -> Result<(), String> {
    let sound_path = format!("/System/Library/Sounds/{sound_name}.aiff");
    std::process::Command::new("afplay")
        .arg(&sound_path)
        .output()
        .map_err(|e| format!("failed to play sound: {e}"))?;
    Ok(())
}
```

### 3. 前端 playSoundById 优先使用 Rust fallback to HTMLAudioElement

`src/lib/sound.ts`：
```typescript
export async function playSoundById(soundId: string): Promise<void> {
  if (SYSTEM_SOUNDS.includes(soundId as SystemSound)) {
    try {
      await invoke("play_sound", { soundName: soundId });
      return;
    } catch { /* fall through */ }
  }
  // HTMLAudioElement fallback for custom paths
}
```

### 4. SoundPicker 使用 useState 管理本地状态

`src/components/settings/SoundSelector.tsx`：
```tsx
function SoundPicker({ value, customPath, onChange, onCustomPathChange }) {
  const [localValue, setLocalValue] = useState(value);
  const [localCustomPath, setLocalCustomPath] = useState(customPath);

  function handleChange(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    if (v === "custom" || SYSTEM_SOUNDS.includes(v as SystemSound)) {
      setLocalValue(v as SoundChoice); // 更新本地 state
      onChange(v as SoundChoice);     // 写入 localStorage
    }
  }
}
```

## 文件变更

- `src-tauri/tauri.conf.json` — CSP 添加 media-src
- `src-tauri/src/approval.rs` — 添加 play_sound command
- `src-tauri/src/lib.rs` — 注册 play_sound command
- `src/lib/sound.ts` — 优先 Rust fallback 机制
- `src/components/settings/SoundSelector.tsx` — useState 本地状态管理

## 测试

1. 打开 Settings → 审批声音
2. 选择不同声音（Ping、Blow、Glass 等）
3. 点击 Preview，每个应听到对应声音

**验证结果**：✅ 每个声音现在播放正确