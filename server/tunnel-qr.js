// Generate QR code for Cloudflare Tunnel URL
// Usage: node tunnel-qr.js <tunnel-url>

const QRCode = require('qrcode');

const tunnelUrl = process.argv[2];

if (!tunnelUrl) {
    console.error('❌ Please provide the tunnel URL');
    console.error('Usage: node tunnel-qr.js https://your-url.trycloudflare.com');
    process.exit(1);
}

// Add /client/pages/mobile.html to the URL
const mobileUrl = `${tunnelUrl}/client/pages/mobile.html`;

console.log('\n📱 Generating QR code for mobile controller...');
console.log(`🔗 URL: ${mobileUrl}\n`);

// Generate QR code in terminal
QRCode.toString(mobileUrl, { type: 'terminal', small: true }, (err, qr) => {
    if (err) {
        console.error('❌ Error generating QR code:', err);
        process.exit(1);
    }
    
    console.log(qr);
    console.log('\n✅ QR code generated!');
    console.log('📱 Scan this with your phone to access the mobile controller');
    console.log(`🔗 Direct URL: ${mobileUrl}\n`);
});

// Also save as PNG file
QRCode.toFile('tunnel-qr-code.png', mobileUrl, {
    width: 500,
    margin: 2,
    color: {
        dark: '#000000',
        light: '#FFFFFF'
    }
}, (err) => {
    if (err) {
        console.error('❌ Error saving QR code image:', err);
    } else {
        console.log('💾 QR code saved as: tunnel-qr-code.png');
        console.log('   You can display this on screen or print it\n');
    }
});
