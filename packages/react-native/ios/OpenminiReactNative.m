#import <React/RCTBridgeModule.h>
#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE (OpenMiniWebViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(packagePath, NSString)
RCT_EXPORT_VIEW_PROPERTY(entry, NSString)
RCT_EXPORT_VIEW_PROPERTY(bootstrapScript, NSString)
RCT_EXPORT_VIEW_PROPERTY(onBridgeMessage, RCTDirectEventBlock)
RCT_EXTERN_METHOD(postMessage : (nonnull NSNumber *)reactTag raw : (NSString *)raw)
@end

@interface RCT_EXTERN_MODULE (OpenMiniFiles, NSObject)
RCT_EXTERN_METHOD(getCacheDir : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(exists : (NSString *)path resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(readText : (NSString *)path resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(writeFileBase64 : (NSString *)path base64 : (NSString *)base64 resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(rename : (NSString *)from to : (NSString *)to resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(removeDir : (NSString *)path resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(sha256Base64 : (NSString *)base64 resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
@end
