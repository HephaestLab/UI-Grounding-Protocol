import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { assert, experimentRoot } from './lib.mjs';

const environmentPath = join(
  experimentRoot,
  'vendor',
  'webmall',
  'Browsergym',
  'browsergym',
  'core',
  'src',
  'browsergym',
  'core',
  'env.py',
);

const validationBefore = String.raw`        # call validate
        reward, done, user_message, info = self.task.validate(self.page, self.chat.messages)`;
const validationAfter = String.raw`        # Validation may race with a navigation started by the action. Retry
        # the read-only validation pass without executing the action again.
        for retries_left in reversed(range(EXTRACT_OBS_MAX_TRIES)):
            try:
                reward, done, user_message, info = self.task.validate(
                    self.page, self.chat.messages
                )
            except playwright.sync_api.Error as e:
                err_msg = str(e)
                if retries_left > 0 and (
                    "Unable to retrieve content because the page is navigating"
                    in err_msg
                    or "Execution context was destroyed" in err_msg
                ):
                    logger.warning(
                        f"Task validation raced with navigation. Retrying ({retries_left}/{EXTRACT_OBS_MAX_TRIES} tries left).\n{repr(e)}"
                    )
                    self._wait_dom_loaded()
                    time.sleep(0.5)
                    continue
                raise
            break`;

const extractionBefore = String.raw`                focused_element_bid = extract_focused_element_bid(self.page)
                extra_properties = extract_dom_extra_properties(dom)
            except (playwright.sync_api.Error, MarkingError) as e:`;
const extractionAfter = String.raw`                focused_element_bid = extract_focused_element_bid(self.page)
                extra_properties = extract_dom_extra_properties(dom)
                # Keep cleanup inside the retryable extraction transaction. A
                # navigation can destroy the execution context after the DOM
                # snapshot succeeds but before temporary marks are removed.
                _post_extract(self.page)
            except (playwright.sync_api.Error, MarkingError) as e:`;

const retryCleanupBefore = String.raw`                    # post-extract cleanup (ARIA attributes)
                    _post_extract(self.page)`;
const retryCleanupAfter = String.raw`                    # Best-effort cleanup. If the frame navigated, its old
                    # execution context (and the temporary marks) is gone.
                    try:
                        _post_extract(self.page)
                    except playwright.sync_api.Error:
                        pass`;

const finalCleanupBefore = String.raw`
        # post-extraction cleanup of temporary info in dom
        _post_extract(self.page)
`;
const finalCleanupAfter = '';

function replaceSupportedState(contents, before, after, label) {
  if (contents.includes(after) && after.length > 0) {
    return { contents, changed: false };
  }
  if (after.length === 0 && !contents.includes(before)) {
    return { contents, changed: false };
  }
  assert(contents.includes(before), `Unsupported BrowserGym ${label} state`);
  return { contents: contents.replace(before, after), changed: true };
}

let contents = (await readFile(environmentPath, 'utf8')).replaceAll(
  '\r\n',
  '\n',
);
let changed = false;
for (const [before, after, label] of [
  [validationBefore, validationAfter, 'validation'],
  [extractionBefore, extractionAfter, 'extraction'],
  [retryCleanupBefore, retryCleanupAfter, 'retry cleanup'],
  [finalCleanupBefore, finalCleanupAfter, 'final cleanup'],
]) {
  const result = replaceSupportedState(contents, before, after, label);
  contents = result.contents;
  changed ||= result.changed;
}

if (changed) {
  await writeFile(environmentPath, contents, 'utf8');
  console.log('Applied WebMall BrowserGym navigation-race patch.');
} else {
  console.log('WebMall BrowserGym navigation-race patch is already applied.');
}
