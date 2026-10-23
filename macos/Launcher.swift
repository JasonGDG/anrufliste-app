import AppKit
final class AppDelegate: NSObject, NSApplicationDelegate {
    var task: Process?
    var window: NSWindow!
    var label: NSTextField!
    var buffer = ""
    var appURL: URL?
    var stopping = false
    var logHandle: FileHandle?
    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let item = NSMenuItem()
        menu.addItem(item)
        let submenu = NSMenu()
        submenu.addItem(withTitle: "Anrufliste beenden", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.submenu = submenu
        NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: 180), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "Anrufliste"
        window.center()
        label = NSTextField(wrappingLabelWithString: "Anrufliste wird vorbereitet. Beim ersten Start werden Node.js, Python und Claude Code heruntergeladen. Das kann einige Minuten dauern.")
        label.frame = NSRect(x: 28, y: 55, width: 464, height: 90)
        window.contentView?.addSubview(label)
        let spinner = NSProgressIndicator(frame: NSRect(x: 28, y: 22, width: 28, height: 28))
        spinner.style = .spinning
        spinner.startAnimation(nil)
        window.contentView?.addSubview(spinner)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        start()
    }
    func start() {
        guard let resources = Bundle.main.resourcePath else { return }
        let state = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Anrufliste")
        do {
            try FileManager.default.createDirectory(at: state, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let logfile = state.appendingPathComponent("start.log")
            FileManager.default.createFile(atPath: logfile.path, contents: nil, attributes: [.posixPermissions: 0o600])
            logHandle = try FileHandle(forWritingTo: logfile)
            let p = Process()
            let pipe = Pipe()
            p.executableURL = URL(fileURLWithPath: "/bin/bash")
            p.arguments = [resources + "/bootstrap.sh", resources]
            p.standardOutput = pipe
            p.standardError = logHandle
            pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let data = handle.availableData
                guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
                DispatchQueue.main.async { self?.receive(text) }
            }
            p.terminationHandler = { [weak self] process in
                DispatchQueue.main.async {
                    guard let self = self, !self.stopping else { return }
                    self.failed("Die Anrufliste wurde beendet (Code \(process.terminationStatus)). Details stehen unter ~/Library/Application Support/Anrufliste/start.log. Bitte Internetverbindung prüfen und erneut öffnen.")
                }
            }
            task = p
            try p.run()
        } catch { failed(error.localizedDescription) }
    }
    func receive(_ text: String) {
        buffer += text
        while let end = buffer.firstIndex(of: "\n") {
            let line = String(buffer[..<end])
            buffer.removeSubrange(...end)
            if line.hasPrefix("ANRUFLISTE_STATUS=") { label.stringValue = String(line.dropFirst("ANRUFLISTE_STATUS=".count)) }
            if line.hasPrefix("ANRUFLISTE_READY="), let url = URL(string: String(line.dropFirst("ANRUFLISTE_READY=".count))) {
                appURL = url
                NSWorkspace.shared.open(url)
                window.orderOut(nil)
            }
        }
    }
    func failed(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "Anrufliste konnte nicht gestartet werden"
        alert.informativeText = message
        alert.runModal()
        NSApp.terminate(nil)
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if let url = appURL { NSWorkspace.shared.open(url) } else { window.makeKeyAndOrderFront(nil) }
        return true
    }
    func applicationWillTerminate(_ notification: Notification) {
        stopping = true
        if let p = task, p.isRunning { p.terminate() }
    }
}
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
