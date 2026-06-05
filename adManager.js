// adManager.js

// Aapke Real AdMob IDs
const AD_IDS = {
    android: {
        appId: 'ca-app-pub-6519206650027176~4620229874',
        banner: 'ca-app-pub-6519206650027176/9840766965',
        interstitial: 'ca-app-pub-6519206650027176/7023031932',
        rewarded: 'ca-app-pub-6519206650027176/5850540745'
    }
};

export const AdManager = {
    async init() {
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            try {
                const { AdMob } = window.Capacitor.Plugins;
                await AdMob.initialize({
                    requestTrackingAuthorization: true,
                    testingDevices: [], // Empty means REAL ADS will show
                    initializeForTesting: false // 100% Real Ads Mode
                });
                console.log("AdMob Initialized with Real IDs");
            } catch (error) {
                console.error("AdMob Init Error:", error);
            }
        }
    },

    async showBanner() {
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            try {
                const { AdMob, BannerAdSize, BannerAdPosition } = window.Capacitor.Plugins;
                await AdMob.showBanner({
                    adId: AD_IDS.android.banner,
                    adSize: 'ADAPTIVE_BANNER',
                    position: 'BOTTOM_CENTER',
                    margin: 0,
                    isTesting: false
                });
            } catch (error) {
                console.error("Banner Ad Error:", error);
            }
        }
    },

    async showInterstitial() {
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            try {
                const { AdMob } = window.Capacitor.Plugins;
                await AdMob.prepareInterstitial({
                    adId: AD_IDS.android.interstitial,
                    isTesting: false
                });
                await AdMob.showInterstitial();
            } catch (error) {
                console.error("Interstitial Ad Error:", error);
            }
        }
    },

    async showRewarded() {
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            try {
                const { AdMob } = window.Capacitor.Plugins;
                await AdMob.prepareRewardVideoAd({
                    adId: AD_IDS.android.rewarded,
                    isTesting: false
                });
                const rewardItem = await AdMob.showRewardVideoAd();
                return rewardItem; // Returns true/false if user watched full ad
            } catch (error) {
                console.error("Rewarded Ad Error:", error);
                return false;
            }
        }
        return true; // Web par bina ad ke bypass kar dega
    }
};

// Auto-initialize when file loads
AdManager.init();
