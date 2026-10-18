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

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern IntPtr WindowFromPoint(POINT Point);

    [DllImport("user32.dll")]
    public static extern IntPtr GetAncestor(IntPtr hwnd, uint gaFlags);

    [DllImport("user32.dll")]
    public static extern uint GetClipboardSequenceNumber();

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    const int SW_RESTORE = 9;
    const uint GA_ROOT = 2;

    const int VK_SHIFT = 0x10;
    const int VK_CONTROL = 0x11;
    const int VK_MENU = 0x12; // Alt
    const int VK_LWIN = 0x5B;
    const int VK_RWIN = 0x5C;
    const int VK_V = 0x56;
    const int VK_C = 0x43;

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

        if (args[0] == "get-mouse") {
            POINT pt;
            if (GetCursorPos(out pt)) {
                IntPtr wnd = WindowFromPoint(pt);
                IntPtr root = GetAncestor(wnd, GA_ROOT);
                Console.WriteLine((root != IntPtr.Zero ? root : wnd).ToInt64());
                return 0;
            }
            Console.WriteLine("0");
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

            // 如果没有指定有效目标，智能采用鼠标所在窗口
            POINT pt;
            bool hasCursor = GetCursorPos(out pt);
            if (target == IntPtr.Zero && hasCursor) {
                IntPtr wnd = WindowFromPoint(pt);
                IntPtr root = GetAncestor(wnd, GA_ROOT);
                target = root != IntPtr.Zero ? root : wnd;
            }

            // 1. 如果指定了目标窗口且当前并非前台，安全可靠地激活目标窗口到前台
            IntPtr currentFg = GetForegroundWindow();
            if (target != IntPtr.Zero && target != currentFg) {
                try {
                    if (IsIconic(target)) {
                        ShowWindow(target, SW_RESTORE);
                    }

                    uint dummyPid1;
                    uint dummyPid2;
                    uint fgThread = GetWindowThreadProcessId(currentFg, out dummyPid1);
                    uint curThread = GetCurrentThreadId();
                    uint targetThread = GetWindowThreadProcessId(target, out dummyPid2);

                    if (fgThread != 0 && fgThread != targetThread) {
                        AttachThreadInput(curThread, targetThread, true);
                        AttachThreadInput(fgThread, targetThread, true);
                        BringWindowToTop(target);
                        SetForegroundWindow(target);
                        AttachThreadInput(fgThread, targetThread, false);
                        AttachThreadInput(curThread, targetThread, false);
                    } else {
                        BringWindowToTop(target);
                        SetForegroundWindow(target);
                    }
                } catch {
                    // ignore
                }
                Thread.Sleep(50);
            }

            // 2. 等待物理修饰键自然释放（最多等待 1000ms）
            WaitModifiersReleased(1000);

            // 额外安全缓冲
            Thread.Sleep(30);

            // 3. 发送纯净的标准 Ctrl+V 组合键
            // 先压下 Ctrl，并在 Ctrl 按住的状态下强制虚拟释放 Alt/Shift/Win（彻底消除物理 Alt 残留干扰，且绝不激活系统菜单）
            keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
            Thread.Sleep(10);
            keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_RWIN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(15);

            keybd_event(VK_V, 0, 0, UIntPtr.Zero);
            Thread.Sleep(30);
            keybd_event(VK_V, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(15);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);

            return 0;
        }

        if (args[0] == "copy") {
            IntPtr target = IntPtr.Zero;
            if (args.Length >= 2) {
                long hwndVal;
                if (long.TryParse(args[1], out hwndVal) && hwndVal != 0) {
                    target = new IntPtr(hwndVal);
                }
            }

            IntPtr currentFg = GetForegroundWindow();
            if (target == IntPtr.Zero) {
                target = currentFg;
            }

            // 如果指定了目标窗口且当前并非前台，确保将目标窗口恢复并激活为前台
            if (target != IntPtr.Zero && target != currentFg) {
                try {
                    if (IsIconic(target)) {
                        ShowWindow(target, SW_RESTORE);
                    }

                    uint dummyPid1;
                    uint dummyPid2;
                    uint fgThread = GetWindowThreadProcessId(currentFg, out dummyPid1);
                    uint curThread = GetCurrentThreadId();
                    uint targetThread = GetWindowThreadProcessId(target, out dummyPid2);

                    if (fgThread != 0 && fgThread != targetThread) {
                        AttachThreadInput(curThread, targetThread, true);
                        AttachThreadInput(fgThread, targetThread, true);
                        BringWindowToTop(target);
                        SetForegroundWindow(target);
                        AttachThreadInput(fgThread, targetThread, false);
                        AttachThreadInput(curThread, targetThread, false);
                    } else {
                        BringWindowToTop(target);
                        SetForegroundWindow(target);
                    }
                } catch {
                    // ignore
                }
                Thread.Sleep(40);
            }

            // 记录发送前剪贴板序列号
            uint seqBefore = GetClipboardSequenceNumber();

            // 1. 等待物理快捷键（尤其是 Alt、Shift、Win 等修饰键）自然释放
            WaitModifiersReleased(800);
            Thread.Sleep(20);

            // 2. 发送纯净的标准 Ctrl+C 组合键
            // 先压下 Ctrl，并在 Ctrl 按住的状态下强制虚拟释放物理可能残留的 Alt/Shift/Win
            keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
            Thread.Sleep(10);
            keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_RWIN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(15);

            keybd_event(VK_C, 0, 0, UIntPtr.Zero);
            Thread.Sleep(30);
            keybd_event(VK_C, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(15);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);

            // 3. 轮询检测目标应用是否响应 Ctrl+C 写入了剪贴板（序列号变化）
            int waited = 0;
            while (waited < 450) {
                Thread.Sleep(25);
                waited += 25;
                if (GetClipboardSequenceNumber() != seqBefore) {
                    Console.WriteLine("COPIED");
                    return 0;
                }
            }

            Console.WriteLine("UNCHANGED");
            return 0;
        }

        return 0;
    }
}
