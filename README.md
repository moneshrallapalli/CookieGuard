CookieGuard: Browser Privacy Protection System

Monesh Rallapalli

Course: Security for Networked Systems (CSCI-B 544)

Github: https://github.com/moneshrallapalli/CookieGuard.git

Kaltura: https://iu.mediaspace.kaltura.com/media/t/1_5h9blbmk
 
Summary
I built CookieGuard as my final project—a Chrome extension that tackles web tracking through rule-based cookie classification, fingerprinting detection, and CNAME cloaking identification. Everything runs locally in the browser because I didn't want to deal with setting up servers or storing user data.
The extension detects five fingerprinting techniques (Canvas, WebGL, Audio, Font Enumeration, WebRTC) by hooking browser APIs before page scripts load. For CNAME cloaking, I use DNS-over-HTTPS to identify third-party trackers disguising themselves as first-party domains. I built an interactive dashboard with D3.js showing real-time tracking activity.
Testing went well—fingerprinting detection worked on BrowserLeaks.com and CreepJS.com, and I found CNAME cloaking on about 9% of sites I visited. The biggest challenge was working within Manifest V3 constraints, especially getting API hooking timing right.
 
1. Problem and Motivation
I got interested in web privacy after using Privacy Badger and wondering how it actually worked. When I visited CNN.com for testing, Chrome showed 47 cookies—I had no idea which were necessary versus tracking me. That's when I realized users need something smarter than "block all third-party cookies."
Three problems stood out:
Cookie Overload: Sites set 20-50+ cookies per session. Manual classification is impossible, and existing tools miss new trackers.
Advanced Fingerprinting: Trackers identify users using Canvas, WebGL, and Audio techniques—completely without cookies. Privacy Badger doesn't detect these at all.
CNAME Cloaking: Research shows ~10% of websites use DNS CNAME records to disguise third-party trackers as first-party domains, bypassing browser protections.
I designed CookieGuard to address all three using local processing—no external servers, no telemetry.
 
2. Technical Architecture
2.1 System Components
CookieGuard is a Chrome Manifest V3 extension with three parts:
Content Script: Injects fingerprint detection code at document_start timing—before page scripts execute. My first version injected at document_idle and completely failed because tracking scripts had already run. I spent 3 hours debugging before Chrome DevTools showed me the load order problem.
Background Service Worker: Handles cookie detection via chrome.cookies.onChanged, feature extraction, classification, CNAME checking through DNS queries, and blocking rules. The service worker constraints were frustrating—I initially tried loading ONNX Runtime for ML inference but couldn't get ES6 modules working. After wasting a day on this, I fell back to rule-based classification.
Dashboard: Built with D3.js for interactive visualizations—pie charts, bar charts, timelines, and searchable tables. Auto-refreshes every 10 seconds with live IndexedDB data. Getting click interactions working took 6-7 hours because D3's event handling has a learning curve.
2.2 Data Storage
IndexedDB with four object stores:
•	cookies: Metadata with SHA-256 hashed values
•	classifications: Results with confidence scores
•	fingerprints: Detection attempts with technique and domain
•	cname_cloaking: CNAME chains and tracker identification
Auto-cleanup purges data older than 7 days to prevent unlimited growth.
 
3. Cookie Classification
I built a rule-based classifier matching cookies against patterns from tracker databases (EasyList, EasyPrivacy, Disconnect.me). It checks:
Essential patterns: Session IDs, CSRF tokens, auth cookies (PHPSESSID, csrf_token)
Analytics patterns: Google Analytics (_ga, _gid), Adobe Analytics, Matomo
Advertising patterns: DoubleClick, Facebook Pixel, ad network domains
Social media patterns: Facebook, Twitter, LinkedIn trackers
For each cookie, I extract 16 features: name/value length, security flags (secure, httpOnly, sameSite), session vs. persistent, expiration days, pattern indicators (tracking patterns, PII, UUID, base64), Shannon entropy, and first-party context.
I originally designed these features for a Random Forest ML model, but since I couldn't integrate ONNX Runtime, the rule-based classifier mainly uses name patterns and domain matching.
Confidence scores:
•	Essential (session, auth): 98%
•	Known tracker domains: 95%
•	Functional patterns: 85%
•	First-party sessions: 70%
•	Unknown: 50%
These are somewhat arbitrary—I picked them based on how confident I felt during manual testing.
 
4. Fingerprinting Detection
4.1 Implementation Challenge
Content scripts run isolated from the page's JavaScript environment, so I can't hook browser APIs from there. The solution was injecting a script directly into page context:
const script = document.createElement('script');
script.src = chrome.runtime.getURL('content/fingerprint-detector.js');
(document.head || document.documentElement).appendChild(script);
Even this had issues—sometimes document.head didn't exist yet at document_start, causing intermittent failures. The fix was falling back to documentElement.
4.2 Detection Methods
Canvas Fingerprinting: Hooked toDataURL() and getImageData(). Canvases larger than 16x16 pixels extracting data trigger detection. The 16x16 threshold is arbitrary—I picked it to avoid tiny icon canvases, but haven't tested extensively for false positives.
WebGL Fingerprinting: Monitor getParameter() calls for RENDERER/VENDOR queries. More than 10 parameter queries indicates fingerprinting.
Audio Fingerprinting: Detect OscillatorNode + AnalyserNode pattern without audio output.
Font Enumeration: Track measureText() calls. More than 50 measurements within 100ms is suspicious.
WebRTC IP Leak: Monitor RTCPeerConnection and ICE candidate gathering that can leak local IPs.
Testing on BrowserLeaks.com, CreepJS.com, and AmIUnique.org showed 100% detection on the specific fingerprinting methods they used. I haven't tested on many normal websites for false positives though.
 
5. CNAME Cloaking Detection
CNAME cloaking is sneaky—trackers set up subdomains (analytics.yoursite.com) that CNAME to their actual domain (collector.tracker.net). Browsers see it as first-party.
I use Cloudflare's DNS-over-HTTPS to resolve CNAME records:
async function resolveCNAME(domain) {
    const dohUrl = `https://cloudflare-dns.com/dns-query?name=${domain}&type=CNAME`;
    const response = await fetch(dohUrl, {
        headers: { 'Accept': 'application/dns-json' }
    });
    // Check against known trackers
}
When detecting a CNAME to known trackers (Eulerian, Adobe, Oracle, Criteo), I log it, upgrade classification to "Advertising", and block if in Balanced/Strict mode.
Initial DNS queries added 150-250ms latency, which was really noticeable. I added 1-hour TTL cache with LRU eviction (1000 entries). After an hour of browsing, cache hit rate stabilized around 90%, reducing lookups to <1ms.
Over two weeks browsing 150+ sites, I found CNAME cloaking on 14 sites (9.3%): Eulerian (6), Adobe Analytics (4), Oracle Eloqua (2). Forbes.com was the most obvious example.
 
6. Testing Results
High-tracking sites in Balanced mode:
•	CNN.com: 47 cookies detected, 31 blocked (66%)
•	BuzzFeed.com: 52 cookies detected, 38 blocked (73%)
•	Forbes.com: 41 cookies detected, 29 blocked (71%)
Sites still worked—commenting, personalization, shopping carts all functional.
Fingerprinting detection: Successfully caught all attempts on BrowserLeaks, CreepJS, and AmIUnique. BrowserLeaks showed Canvas extraction, WebGL RENDERER query, and Font enumeration (201 measurements in 85ms).
I didn't do formal accuracy validation—that would've required manually labeling hundreds of cookies. With the deadline approaching, I prioritized getting features working over rigorous evaluation.
 
7. Challenges
Manifest V3 Constraints: Service workers don't support ES6 module imports as expected. ONNX Runtime loading failed silently. After digging through documentation and StackOverflow, I learned service workers need different script loading. Eventually gave up on ML and stuck with rules.
API Hooking Timing: First implementation at document_idle failed completely. Switching to document_start helped, but had intermittent failures with script injection.
IndexedDB Async Operations: Every operation returns request objects with success/error events. Race conditions when cookies arrived faster than writes completed. Implemented a queue to serialize writes.
D3.js Learning Curve: Understanding data joins, enter/update/exit patterns, and click interactions took longer than expected. Spent 6-7 hours on dashboard alone.
 
8. What I'd Do Differently
If I started over, I'd prototype ML integration first before building the training pipeline. I spent time on Random Forest training and ONNX conversion, only to discover I couldn't use it. That was wasted effort.
My testing was ad-hoc—just visiting sites and checking if things worked. Systematic approach would be: collect 500+ labeled cookies, calculate precision/recall, test on unseen sites, measure false positives. Didn't have time for this.
I never did real performance benchmarking. Code has performance.now() calls but no systematic measurements. For production, even 50ms added latency matters.
 
9. Conclusion
CookieGuard works pretty well—it detects five fingerprinting techniques, unmasks CNAME cloaking, and blocks tracking cookies without breaking sites. The biggest lesson was the gap between design and implementation. I spent a week on ML that I couldn't deploy, while the rule-based classifier I built in a day works fine.
Finding CNAME cloaking on 9% of sites I visited—including Forbes—shows trackers actively circumvent browser protections. The extension isn't perfect (no ML, no systematic validation, only detecting fingerprinting not blocking it), but as a proof-of-concept for local privacy protection, it does what I set out to do.
With more time, I'd focus on: getting the ML model working, adding active fingerprinting defense (canvas noise injection, WebGL randomization), and proper accuracy evaluation. But for a semester project, I'm reasonably happy with where it ended up.
 
References
1.	Gunes Acar, Marc Juarez, Nick Nikiforakis, Claudia Diaz, Seda Gürses, Frank Piessens, and Bart Preneel. 2013. FPDetective: dusting the web for fingerprinters. In Proceedings of the 2013 ACM SIGSAC conference on Computer &amp; communications security (CCS '13). Association for Computing Machinery, New York, NY, USA, 1129–1140. https://doi.org/10.1145/2508859.2516674
2.	Steven Englehardt and Arvind Narayanan. 2016. Online Tracking: A 1-million-site Measurement and Analysis. In Proceedings of the 2016 ACM SIGSAC Conference on Computer and Communications Security (CCS '16). Association for Computing Machinery, New York, NY, USA, 1388–1401. https://doi.org/10.1145/2976749.2978313Iqbal, U., Englehardt, S., & Shafiq, Z. (2021). Fingerprinting the fingerprinters: Learning to detect browser fingerprinting behaviors. IEEE S&P 2021, 1143-1161.
3.	Pierre Laperdrix, Nataliia Bielova, Benoit Baudry, and Gildas Avoine. 2020. Browser Fingerprinting: A Survey. ACM Trans. Web 14, 2, Article 8 (May 2020), 33 pages. https://doi.org/10.1145/3386040
4.	EasyList. (2024). https://easylist.to/
5.	Disconnect. (2024). https://disconnect.me/trackerprotection
6.	"Claude.AI: Used for debugging code, adding new features, and enhancing my report by correcting grammar, improving sentence structure, and framing proper sentences.
