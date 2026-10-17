using System;
using System.Runtime.InteropServices;
using System.Threading;

public class PasteHelper {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    const int SW_RESTORE = 9;

    const int VK_SHIFT = 0x10;
    const int VK_CONTROL = 0x11;
    const int VK_MENU = 0x12; // Alt
    const int VK_LWIN = 0x5B;
    const int VK_RWIN = 0x5C;
    const int VK_V = 0x56;

    const uint KEYEVENTF_KEYUP = 0x0002;

    /// <summary>
    /// 等待物理修饰键（Alt, Ctrl, Shift, Win）完全释放，防止模拟按键与硬件长按产生冲突（例如用户按下 Alt+V 时 Alt 尚未松开，此时模拟 Ctrl+V 会变成 Ctrl+Alt+V 导致粘贴失效）
    /// </summary>
    static void WaitModifiersReleased(int maxWaitMs) {
        int waited = 0;
        while (waited < maxWaitMs) {
            bool altDown = (GetAsyncKeyState(VK_MENU) & 0x8000) != 0;
            bool ctrlDown = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
            bool shiftDown = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;
            bool winDown = ((GetAsyncKeyState(VK_LWIN) & 0x8000) != 0) || ((GetAsyncKeyState(VK_RWIN) & 0x8000) != 0);

            if (!altDown && !ctrlDown && !shiftDown && !winDown) {
                break;
            }
            Thread.Sleep(15);
            waited += 15;
        }
    }

    public static int Main(string[] args) {
        if (args.Length == 0 || args[0] == "get") {
            IntPtr fg = GetForegroundWindow();
            Console.WriteLine(fg.ToInt64());
            return 0;
        }

        if (args[0] == "paste") {
            IntPtr target = IntPtr.Zero;
            if (args.Length >= 2) {
                long hwndVal;
                if (long.TryParse(args[1], out hwndVal) && hwndVal != 0) {
                    target = new IntPtr(hwndVal);
                }
            }

            // 1. 如果指定了非零目标窗口，安全激活前台（绝对不使用危险的 AttachThreadInput，避免目标应用如微信崩溃或退出）
            if (target != IntPtr.Zero) {
                try {
                    if (IsIconic(target)) {
                        ShowWindow(target, SW_RESTORE);
                    }
                    BringWindowToTop(target);
                    SetForegroundWindow(target);
                } catch {
                    // ignore
                }
            }

            // 2. 关键：等待用户可能按着的物理 Alt / Ctrl / Shift 键完全抬起（最多等待 350ms）
            WaitModifiersReleased(350);

            // 额外安全缓冲，确保操作系统键盘状态队列与焦点同步
            Thread.Sleep(30);

            // 3. 发送纯净的标准 Ctrl+V 组合键（严禁单独单发 VK_MENU KEYUP，避免激活系统菜单触发关闭(C)等异常指令）
            keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
            keybd_event(VK_V, 0, 0, UIntPtr.Zero);
            Thread.Sleep(25);
            keybd_event(VK_V, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);

            return 0;
        }

        return 0;
    }
}
