#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(VizeBridge, RCTEventEmitter)
RCT_EXTERN_METHOD(status:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(history:(nonnull NSNumber *)from to:(nonnull NSNumber *)to
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setCapture:(BOOL)enabled resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(createCategory:(NSString *)name resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(assignCategory:(nonnull NSNumber *)activityID category:(nonnull NSNumber *)categoryID
                  saveDefault:(BOOL)saveDefault resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(assignGroupCategory:(nonnull NSArray<NSNumber *> *)activityIDs category:(nonnull NSNumber *)categoryID
                  saveDefault:(BOOL)saveDefault resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(timerCommand:(NSString *)command resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setDurations:(nonnull NSNumber *)focus rest:(nonnull NSNumber *)rest
                  resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(readAccountSession:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(writeAccountSession:(nullable NSString *)value resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(sendAccountRequest:(NSString *)path method:(NSString *)method body:(nullable NSString *)body
                  token:(nullable NSString *)token resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
