package expo.modules.postcardusdz

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PostcardUsdzModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PostcardUsdz")

    AsyncFunction("generateUSDZ") { _: String, _: String ->
      return@AsyncFunction ""
    }

    AsyncFunction("shareViaIMessage") { _: String, _: String, _: String ->
      return@AsyncFunction mapOf("status" to "unsupported")
    }
  }
}
