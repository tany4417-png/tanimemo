import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitestはglobals:falseのため、@testing-library/reactの自動cleanupが効かない
// （複数のReactコンポーネントテストが同じjsdom document上でDOMを積み重ね、
// getByLabelText等が「複数ヒット」で失敗する）。テストごとに明示的に後始末する
afterEach(() => {
  cleanup();
});
