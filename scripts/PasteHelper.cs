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
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    const int SW_SHOW = 5;
    const byte VK_SHIFT = 0x10;
    const byte VK_CONTROL = 0x11;
    const byte VK_MENU = 0x12; // Alt
    const byte VK_V = 0x56;
    const uint KEYEVENTF_KEYUP = 0x0002;

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

            if (target != IntPtr.Zero) {
                uint curThread = GetCurrentThreadId();
                uint targetThread = GetWindowThreadProcessId(target, IntPtr.Zero);
                if (curThread != targetThread) {
                    AttachThreadInput(curThread, targetThread, true);
                }
                ShowWindow(target, SW_SHOW);
                BringWindowToTop(target);
                SetForegroundWindow(target);
                if (curThread != targetThread) {
                    AttachThreadInput(curThread, targetThread, false);
                }
                Thread.Sleep(80);
            } else {
                Thread.Sleep(100);
            }

            // 彻底释放可能被 Alt+C 快捷键锁定的修饰键状态（Alt, Shift, Ctrl）
            keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(20);

            // 发送标准的 Ctrl+V 组合键
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
