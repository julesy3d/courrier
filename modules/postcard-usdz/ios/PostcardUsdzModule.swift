import ExpoModulesCore
import SceneKit
import ModelIO
import SceneKit.ModelIO
import MessageUI

public class PostcardUsdzModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PostcardUsdz")

    AsyncFunction("generateUSDZ") { (rectoUri: String, versoUri: String) -> String in
      guard let rectoURL = URL(string: rectoUri),
            let rectoData = try? Data(contentsOf: rectoURL),
            let rectoImage = UIImage(data: rectoData) else {
        throw PostcardError.imageLoadFailed("recto", rectoUri)
      }

      guard let versoURL = URL(string: versoUri),
            let versoData = try? Data(contentsOf: versoURL),
            let versoImage = UIImage(data: versoData) else {
        throw PostcardError.imageLoadFailed("verso", versoUri)
      }

      let scene = SCNScene()
      let card = SCNBox(width: 0.7038, height: 1.0, length: 0.002, chamferRadius: 0)

      let rectoMaterial = SCNMaterial()
      rectoMaterial.diffuse.contents = rectoImage
      rectoMaterial.lightingModel = .physicallyBased
      rectoMaterial.roughness.contents = 0.8
      rectoMaterial.isDoubleSided = false

      let versoMaterial = SCNMaterial()
      versoMaterial.lightingModel = .physicallyBased
      versoMaterial.roughness.contents = 0.8
      versoMaterial.isDoubleSided = false
        
        let flippedVerso = UIImage(cgImage: versoImage.cgImage!, scale: versoImage.scale, orientation: .upMirrored)
        versoMaterial.diffuse.contents = flippedVerso

      let edgeMaterial = SCNMaterial()
      edgeMaterial.diffuse.contents = UIColor(red: 0.95, green: 0.93, blue: 0.88, alpha: 1.0)
      edgeMaterial.lightingModel = .physicallyBased
      edgeMaterial.roughness.contents = 0.9
      edgeMaterial.isDoubleSided = false

      card.materials = [
        rectoMaterial, edgeMaterial, versoMaterial,
        edgeMaterial, edgeMaterial, edgeMaterial
      ]

      let cardNode = SCNNode(geometry: card)
      scene.rootNode.addChildNode(cardNode)

      let lightNode = SCNNode()
      lightNode.light = SCNLight()
      lightNode.light?.type = .ambient
      lightNode.light?.intensity = 1000
      scene.rootNode.addChildNode(lightNode)

      let tempDir = FileManager.default.temporaryDirectory
      let outputURL = tempDir.appendingPathComponent("postcard_\(UUID().uuidString).usdz")

      if FileManager.default.fileExists(atPath: outputURL.path) {
        try? FileManager.default.removeItem(at: outputURL)
      }

      let success = scene.write(to: outputURL, options: nil, delegate: nil, progressHandler: nil)

      guard success else {
        throw PostcardError.exportFailed
      }

      return outputURL.path
    }

    AsyncFunction("shareViaIMessage") { (usdzPath: String, messageText: String, filename: String, promise: Promise) in
      DispatchQueue.main.async {
        guard MFMessageComposeViewController.canSendText() else {
          promise.reject(PostcardError.cannotSendText)
          return
        }

        guard MFMessageComposeViewController.canSendAttachments() else {
          promise.reject(PostcardError.cannotSendAttachments)
          return
        }

        let fileURL = URL(fileURLWithPath: usdzPath)
        guard FileManager.default.fileExists(atPath: usdzPath),
              let fileData = try? Data(contentsOf: fileURL) else {
          promise.reject(PostcardError.fileNotFound(usdzPath))
          return
        }

        let composer = MFMessageComposeViewController()
        let delegate = MessageDelegate(promise: promise)

        objc_setAssociatedObject(composer, "delegate", delegate, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)

        composer.messageComposeDelegate = delegate
        composer.body = messageText
        composer.addAttachmentData(
          fileData,
          typeIdentifier: "com.pixar.universal-scene-description-mobile",
          filename: filename
        )

        guard let rootVC = self.topViewController() else {
          promise.reject(PostcardError.noViewController)
          return
        }

        rootVC.present(composer, animated: true, completion: nil)
      }
    }
  }

  private func topViewController() -> UIViewController? {
    guard let windowScene = UIApplication.shared.connectedScenes
      .compactMap({ $0 as? UIWindowScene })
      .first,
      let rootVC = windowScene.windows.first(where: { $0.isKeyWindow })?.rootViewController
    else {
      return nil
    }

    var topVC = rootVC
    while let presented = topVC.presentedViewController {
      topVC = presented
    }
    return topVC
  }
}

class MessageDelegate: NSObject, MFMessageComposeViewControllerDelegate {
  private let promise: Promise

  init(promise: Promise) {
    self.promise = promise
  }

  func messageComposeViewController(
    _ controller: MFMessageComposeViewController,
    didFinishWith result: MessageComposeResult
  ) {
    controller.dismiss(animated: true) {
      switch result {
      case .sent:
        self.promise.resolve(["status": "sent"])
      case .cancelled:
        self.promise.resolve(["status": "cancelled"])
      case .failed:
        self.promise.reject(PostcardError.sendFailed)
      @unknown default:
        self.promise.resolve(["status": "unknown"])
      }
    }
  }
}

enum PostcardError: Error, CustomStringConvertible {
  case imageLoadFailed(String, String)
  case exportFailed
  case cannotSendText
  case cannotSendAttachments
  case fileNotFound(String)
  case noViewController
  case sendFailed

  var description: String {
    switch self {
    case .imageLoadFailed(let face, let uri):
      return "Failed to load \(face) image from: \(uri)"
    case .exportFailed:
      return "USDZ export failed"
    case .cannotSendText:
      return "Device cannot send text messages"
    case .cannotSendAttachments:
      return "Device cannot send attachments"
    case .fileNotFound(let path):
      return "USDZ file not found at: \(path)"
    case .noViewController:
      return "Could not find a view controller to present from"
    case .sendFailed:
      return "Message send failed"
    }
  }
}
