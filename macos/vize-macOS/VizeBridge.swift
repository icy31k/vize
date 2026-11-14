import Foundation
import React

@objc(VizeBridge)
final class VizeBridge: RCTEventEmitter {
    private var observation: NSObjectProtocol?

    override static func requiresMainQueueSetup() -> Bool { true }
    override var methodQueue: DispatchQueue! { .main }
    override func supportedEvents() -> [String]! { ["vizeChanged"] }

    override func startObserving() {
        observation = NotificationCenter.default.addObserver(forName: VizeService.changed, object: nil, queue: .main) {
            [weak self] _ in self?.sendEvent(withName: "vizeChanged", body: VizeService.shared.status())
        }
    }

    override func stopObserving() {
        if let observation {
            NotificationCenter.default.removeObserver(observation)
        }
        observation = nil
    }

    @objc(status:rejecter:)
    func status(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        resolve(VizeService.shared.status())
    }

    @objc(history:to:resolver:rejecter:)
    func history(_ from: NSNumber, to: NSNumber, resolver resolve: RCTPromiseResolveBlock,
                 rejecter reject: RCTPromiseRejectBlock) {
        perform(resolve, reject) { try VizeService.shared.history(from: from.doubleValue, to: to.doubleValue) }
    }

    @objc(setCapture:resolver:rejecter:)
    func setCapture(_ enabled: Bool, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        perform(resolve, reject) { try VizeService.shared.setCapture(enabled); return nil }
    }

    @objc(createCategory:resolver:rejecter:)
    func createCategory(_ name: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        perform(resolve, reject) { try VizeService.shared.createCategory(name); return nil }
    }

    @objc(assignCategory:category:saveDefault:resolver:rejecter:)
    func assignCategory(_ id: NSNumber, category: NSNumber, saveDefault: Bool, resolver resolve: RCTPromiseResolveBlock,
                        rejecter reject: RCTPromiseRejectBlock) {
        perform(resolve, reject) {
            try VizeService.shared.assignCategory(id.int64Value, category: category.int64Value, saveDefault: saveDefault)
            return nil
        }
    }

    @objc(timerCommand:resolver:rejecter:)
    func timerCommand(_ command: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        perform(resolve, reject) { try VizeService.shared.timerCommand(command); return nil }
    }

    @objc(setDurations:rest:resolver:rejecter:)
    func setDurations(_ focus: NSNumber, rest: NSNumber, resolver resolve: RCTPromiseResolveBlock,
                      rejecter reject: RCTPromiseRejectBlock) {
        perform(resolve, reject) {
            try VizeService.shared.setDurations(focus: focus.intValue, rest: rest.intValue)
            return nil
        }
    }

    private func perform(_ resolve: RCTPromiseResolveBlock, _ reject: RCTPromiseRejectBlock,
                         _ work: () throws -> Any?) {
        do { resolve(try work()) }
        catch { reject("vize", error.localizedDescription, error) }
    }
}
