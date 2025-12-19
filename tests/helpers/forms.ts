import { flush } from "./async";

function setValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
): void {
  const proto = Object.getPrototypeOf(el) as object;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
}

export function inputValue(
  window: Window,
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
): void {
  setValue(el, value);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
  el.dispatchEvent(new window.Event("change", { bubbles: true }));
}

export function selectValue(
  window: Window,
  el: HTMLSelectElement,
  value: string
): void {
  setValue(el, value);
  el.dispatchEvent(new window.Event("change", { bubbles: true }));
}

export async function selectBaseUiOption(
  window: Window,
  trigger: HTMLElement,
  optionText: string
): Promise<void> {
  trigger.click();
  await flush(window);

  const popup = window.document.querySelector<HTMLElement>(".mbu-select-popup");
  if (!popup) {
    throw new Error("Select popup not found");
  }

  const option = Array.from(
    popup.querySelectorAll<HTMLElement>(".mbu-select-item")
  ).find((item) => item.textContent?.includes(optionText));
  if (!option) {
    throw new Error(`Select option not found: ${optionText}`);
  }

  // Base UI Select commits selection only when the item is highlighted for mouse interactions.
  option.dispatchEvent(new window.MouseEvent("mousemove", { bubbles: true }));
  await flush(window);
  option.click();
  await flush(window);
}
