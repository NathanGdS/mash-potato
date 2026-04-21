import { useTabsStore } from '../store/tabsStore';
import { useRequestsStore } from '../store/requestsStore';

/**
 * After any tab-close operation, the store has already computed the correct
 * activeTabId.  This helper reads that id and loads the corresponding request
 * (or clears activeRequest when no tabs remain).
 *
 * Both TabBar and ContextMenu should call this instead of duplicating
 * "find adjacent, load request" logic.
 */
export function activateTabAfterClose(): void {
  const { activeTabId } = useTabsStore.getState();
  if (activeTabId) {
    useRequestsStore
      .getState()
      .openRequest(activeTabId)
      .catch((err) => console.error('Failed to load request after tab close:', err));
  } else {
    useRequestsStore.setState({ activeRequest: null });
  }
}