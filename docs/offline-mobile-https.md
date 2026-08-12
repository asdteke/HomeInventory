# Optional Offline Mobile HTTPS

HomeInventory's desktop launcher can keep its normal HTTP workflow and optionally add a trusted HTTPS address for live camera scanning from phones on the same private Wi-Fi network. The feature does not use a domain, public DNS, ACME, a tunnel, or an external certificate service.

## Enable it

1. Start HomeInventory normally in the launcher.
2. Select **Enable secure mobile camera**. This does not replace or block normal HTTP access.
3. Scan the certificate QR for the phone platform:
   - **iPhone/iPad:** install the downloaded profile, then open **Settings → General → About → Certificate Trust Settings** and enable full trust for the displayed HomeInventory CA.
   - **Android:** scanning the QR downloads `HomeInventory-Local-CA.crt`, the public CA certificate generated for this launcher. It contains no private key or HomeInventory data. Choose the phone brand in the launcher and follow the displayed path. A typical Samsung path is **Settings → Security and privacy → More security settings → Install from device storage → CA certificate**. Menu names can vary slightly by Android version.
4. Compare the CA name shown by the phone with the name in the launcher.
5. Scan **Open secure app**. Continue only if the browser opens the HTTPS IP address without a certificate warning.
6. Grant the browser's camera permission when HomeInventory asks for it.

Certificate enrollment links contain a random token and expire after ten minutes. Choose **Refresh setup links** to create new links without replacing the trusted CA.

## Security model

- Each launcher installation creates a unique private CA. Its private key remains under that launcher's per-user application-data directory and is never served to the phone.
- On Unix systems, the HTTPS directory is mode `0700` and private keys are mode `0600`. Windows relies on the current user's application-data ACL.
- The public CA is the only certificate enrollment payload.
- Server certificates contain the detected private LAN IPv4 address as an IP Subject Alternative Name and expire after 90 days. The launcher creates a new leaf certificate when HTTPS is re-enabled or the LAN IP changes, while retaining the trusted CA.
- The HTTPS gateway accepts browser origins only from its exact HTTPS IP and port, forwards traffic only to the launcher-managed loopback service, and adds `Secure` to cookies returned through HTTPS.
- The temporary HTTP enrollment endpoint accepts only private-network clients with the random token. It serves no app data and closes after ten minutes.
- Normal app backups contain database and uploads only; launcher CA keys are outside that backup scope. Release archives never contain generated launcher application data.

If the CA key might be compromised, disable HTTPS and choose **Rotate compromised CA**. Remove the old HomeInventory CA/profile from every phone, then enroll the new CA. Disabling HTTPS alone stops the gateway but cannot remove a certificate already trusted by a phone.

## Limitations

- Enrollment is required once on each phone; neither the browser nor the desktop launcher can change the phone's trust settings automatically.
- Installing the iOS profile is not enough by itself. Full trust for the root certificate must also be enabled.
- Android menu names vary by manufacturer and Android version. Physical-device Android Chrome camera access has been verified; physical-device iOS Safari validation remains pending and simulator behavior is not equivalent.
- Continuing past a certificate warning is not a trusted setup. Test camera access only after the HTTPS address opens without a warning.
- The phone and launcher must be on the same private Wi-Fi/LAN. Guest-network client isolation or a firewall can block the connection.
