import ExpoModulesCore
import UIKit

public final class PagerBlurModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PagerBlur")
    View(PagerBlurView.self) {
      Prop("sigma") { (view: PagerBlurView, sigma: Double) in
        view.setSigma(CGFloat(sigma))
      }
    }
  }
}

/// A non-interactive sibling above the pager, below the bar. No snapshots,
/// private CAFilter API, JS image processing, or blur applied to the icons.
final class PagerBlurView: ExpoView {
  private let backdrop = UIVisualEffectView(effect: nil)
  private var animator: UIViewPropertyAnimator?
  private var sigma: CGFloat = 0
  private var transparencyObserver: NSObjectProtocol?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    clipsToBounds = true
    backdrop.isUserInteractionEnabled = false
    backdrop.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(backdrop)
    transparencyObserver = NotificationCenter.default.addObserver(
      forName: UIAccessibility.reduceTransparencyStatusDidChangeNotification,
      object: nil, queue: .main
    ) { [weak self] _ in self?.applySigma() }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    backdrop.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { resetEffect() } else { applySigma() }
  }

  func setSigma(_ value: CGFloat) {
    sigma = value.isFinite ? min(12, max(0, value)) : 0
    applySigma()
  }

  private func resetEffect() {
    animator?.stopAnimation(true)
    animator = nil
    backdrop.effect = nil
    backdrop.isHidden = true
  }

  private func applySigma() {
    guard window != nil, sigma > 0.01, !UIAccessibility.isReduceTransparencyEnabled else {
      resetEffect()
      return
    }
    backdrop.isHidden = false
    if animator == nil {
      let effectView = backdrop
      let next = UIViewPropertyAnimator(duration: 1, curve: .linear) {
        effectView.effect = UIBlurEffect(style: .light)
      }
      next.pausesOnCompletion = true
      next.startAnimation()
      next.pauseAnimation()
      animator = next
    }
    // UIKit exposes intensity, not Gaussian sigma. This is a visual calibration,
    // deliberately subtle; the Android Gaussian radius uses the exact value.
    animator?.fractionComplete = sigma / 20
  }

  deinit {
    animator?.stopAnimation(true)
    if let observer = transparencyObserver { NotificationCenter.default.removeObserver(observer) }
  }
}
