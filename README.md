# Bluesky Client

A secure desktop client for Bluesky social network built with Electron.

## 🚀 Features

- **Secure Browsing**: Enhanced security with sandboxed renderer and input validation
- **Cross-Platform**: Built for Windows, macOS, and Linux
- **System Tray Integration**: Minimize to tray with complete control
- **Login Persistence**: Remember login sessions across restarts
- **Scroll Refresh**: Convenient scroll wheel and button refresh functionality
- **Memory Efficient**: Advanced memory management with pressure monitoring

## 🛡️ Security

- ✅ Sandboxed renderer process
- ✅ Input validation and sanitization
- ✅ HTTPS-only connections
- ✅ XSS protection
- ✅ File existence checks
- ✅ Error message sanitization

## 📦 Installation

### Windows

Download `Bluesky Client Setup.exe` from the [latest release](https://github.com/gendalf9/bluesky_client_electron/releases).

### macOS

Download `Bluesky Client-*.dmg` from the [latest release](https://github.com/gendalf9/bluesky_client_electron/releases).

### Linux

Choose from the following packages from the [latest release](https://github.com/gendalf9/bluesky_client_electron/releases):

- `Bluesky Client*.AppImage` (Portable)
- `Bluesky Client*.deb` (Debian/Ubuntu)
- `Bluesky Client*.rpm` (RedHat/Fedora)

## 🔧 Development

### Prerequisites

- Node.js 20 or later
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/gendalf9/bluesky_client_electron.git
cd bluesky_client_electron

# Install dependencies
npm install

# Start development
npm start
```

### Building

```bash
# Build for current platform
npm run dist

# Build for all platforms
npm run dist:all

# Build for specific platforms
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux
```

### Testing

```bash
# Run all tests
npm test

# Run security tests
npm run test:security

# Run with coverage
npm run test:coverage
```

### Code Formatting

```bash
# Format code with Prettier
npm run format
```

## 🎯 Usage

1. **Launch the application**
2. **Login to Bluesky** - Your login session will be remembered
3. **Navigate** - Use external links securely (opens in system browser)
4. **Refresh** - Use scroll wheel at top of page or click the floating refresh button
5. **Minimize to Tray** - Close window to minimize to system tray
6. **Exit** - Right-click tray icon and select "Exit" or use Ctrl+Q

## 🔧 Configuration

The application uses secure defaults:

- Node.js integration disabled
- Context isolation enabled
- Sandbox enabled
- Web security enforced

## 🐛 Troubleshooting

### Common Issues

**Q: JavaScript injection errors in console**
A: This is expected behavior due to sandboxing. The application will still function normally.

**Q: Icon not showing**
A: The application will continue to work without the icon. Check the console for specific file missing errors.

**Q: Login not persisting**
A: Make sure the application has proper permissions to write to its data directory.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 Support

For support and questions:

- Open an issue on [GitHub Issues](https://github.com/gendalf9/bluesky_client_electron/issues)
- Check existing issues for solutions

---

**Built with ❤️ for the Bluesky community**
