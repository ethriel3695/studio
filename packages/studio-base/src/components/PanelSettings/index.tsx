// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Link, Typography } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useUnmount } from "react-use";

import { SettingsTree } from "@foxglove/studio";
import { AppSetting } from "@foxglove/studio-base/AppSetting";
import { useConfigById } from "@foxglove/studio-base/PanelAPI";
import { ActionMenu } from "@foxglove/studio-base/components/PanelSettings/ActionMenu";
import SettingsTreeEditor from "@foxglove/studio-base/components/SettingsTreeEditor";
import ShareJsonModal from "@foxglove/studio-base/components/ShareJsonModal";
import { SidebarContent } from "@foxglove/studio-base/components/SidebarContent";
import Stack from "@foxglove/studio-base/components/Stack";
import {
  LayoutState,
  useCurrentLayoutActions,
  useCurrentLayoutSelector,
  useSelectedPanels,
} from "@foxglove/studio-base/context/CurrentLayoutContext";
import { usePanelCatalog } from "@foxglove/studio-base/context/PanelCatalogContext";
import {
  PanelStateStore,
  usePanelStateStore,
} from "@foxglove/studio-base/context/PanelStateContext";
import { useWorkspaceActions } from "@foxglove/studio-base/context/WorkspaceContext";
import { useAppConfigurationValue } from "@foxglove/studio-base/hooks";
import { PanelConfig } from "@foxglove/studio-base/types/panels";
import { TAB_PANEL_TYPE } from "@foxglove/studio-base/util/globalConstants";
import { getPanelTypeFromId } from "@foxglove/studio-base/util/layout";

const selectedLayoutIdSelector = (state: LayoutState) => state.selectedLayout?.id;

const singlePanelIdSelector = (state: LayoutState) =>
  typeof state.selectedLayout?.data?.layout === "string"
    ? state.selectedLayout.data.layout
    : undefined;

const selectIncrementSequenceNumber = (store: PanelStateStore) => store.incrementSequenceNumber;

const EMPTY_SETTINGS_TREE: SettingsTree = Object.freeze({
  actionHandler: () => undefined,
  nodes: {},
});

export default function PanelSettings({
  disableToolbar = false,
  selectedPanelIdsForTests,
}: React.PropsWithChildren<{
  disableToolbar?: boolean;
  selectedPanelIdsForTests?: readonly string[];
}>): JSX.Element {
  const { t } = useTranslation("panelSettings");
  const selectedLayoutId = useCurrentLayoutSelector(selectedLayoutIdSelector);
  const singlePanelId = useCurrentLayoutSelector(singlePanelIdSelector);
  const {
    selectedPanelIds: originalSelectedPanelIds,
    setSelectedPanelIds,
    selectAllPanels,
  } = useSelectedPanels();
  const selectedPanelIds = selectedPanelIdsForTests ?? originalSelectedPanelIds;

  const [enableNewTopNav = false] = useAppConfigurationValue<boolean>(AppSetting.ENABLE_NEW_TOPNAV);

  // If no panel is selected and there is only one panel in the layout, select it
  useEffect(() => {
    if (selectedPanelIds.length === 0 && singlePanelId != undefined) {
      selectAllPanels();
    }
  }, [selectAllPanels, selectedPanelIds, singlePanelId]);

  const { openLayoutBrowser } = useWorkspaceActions();
  const selectedPanelId = useMemo(
    () => (selectedPanelIds.length === 1 ? selectedPanelIds[0] : undefined),
    [selectedPanelIds],
  );

  // Automatically deselect the panel we were editing when the settings sidebar closes
  useUnmount(() => {
    if (selectedPanelId != undefined) {
      setSelectedPanelIds([]);
    }
  });

  const panelCatalog = usePanelCatalog();
  const { getCurrentLayoutState: getCurrentLayout, savePanelConfigs } = useCurrentLayoutActions();
  const panelType = useMemo(
    () => (selectedPanelId != undefined ? getPanelTypeFromId(selectedPanelId) : undefined),
    [selectedPanelId],
  );
  const panelInfo = useMemo(
    () => (panelType != undefined ? panelCatalog.getPanelByType(panelType) : undefined),
    [panelCatalog, panelType],
  );

  const incrementSequenceNumber = usePanelStateStore(selectIncrementSequenceNumber);

  const [showShareModal, setShowShareModal] = useState(false);
  const shareModal = useMemo(() => {
    const panelConfigById = getCurrentLayout().selectedLayout?.data?.configById;
    if (selectedPanelId == undefined || !showShareModal || !panelConfigById) {
      return ReactNull;
    }
    return (
      <ShareJsonModal
        onRequestClose={() => setShowShareModal(false)}
        initialValue={panelConfigById[selectedPanelId] ?? {}}
        onChange={(config) => {
          savePanelConfigs({
            configs: [{ id: selectedPanelId, config: config as PanelConfig, override: true }],
          });
          incrementSequenceNumber(selectedPanelId);
        }}
        title={t("importOrExportSettings")}
      />
    );
  }, [
    getCurrentLayout,
    selectedPanelId,
    showShareModal,
    savePanelConfigs,
    incrementSequenceNumber,
    t,
  ]);

  const [config] = useConfigById(selectedPanelId);

  const settingsTree = usePanelStateStore((state) =>
    selectedPanelId ? state.settingsTrees[selectedPanelId] : undefined,
  );

  const resetToDefaults = useCallback(() => {
    if (selectedPanelId) {
      savePanelConfigs({
        configs: [{ id: selectedPanelId, config: {}, override: true }],
      });
      incrementSequenceNumber(selectedPanelId);
    }
  }, [incrementSequenceNumber, savePanelConfigs, selectedPanelId]);

  if (selectedLayoutId == undefined) {
    return (
      <SidebarContent disableToolbar={disableToolbar} title={t("panelSettings")}>
        <Typography color="text.secondary">
          <Trans
            t={t}
            i18nKey="noLayoutSelected"
            components={{
              selectLayoutLink: <Link onClick={openLayoutBrowser} />,
            }}
          />
        </Typography>
      </SidebarContent>
    );
  }

  if (selectedPanelId == undefined) {
    return (
      <SidebarContent disableToolbar={disableToolbar} title={t("panelSettings")}>
        <Typography color="text.secondary">{t("selectAPanelToEditItsSettings")}</Typography>
      </SidebarContent>
    );
  }

  if (!config) {
    return (
      <SidebarContent disableToolbar={disableToolbar} title={t("panelSettings")}>
        <Typography color="text.secondary">{t("loadingPanelSettings")}</Typography>
      </SidebarContent>
    );
  }

  const isSettingsTree = settingsTree != undefined;

  const showTitleField = panelInfo != undefined && panelInfo.hasCustomToolbar !== true;
  const title = panelInfo?.title ?? t("unknown");

  return (
    <SidebarContent
      disablePadding={enableNewTopNav || isSettingsTree}
      disableToolbar={disableToolbar}
      title={t("currentSettingsPanelName", { title })}
      trailingItems={[
        <ActionMenu
          key={1}
          allowShare={panelType !== TAB_PANEL_TYPE}
          onReset={resetToDefaults}
          onShare={() => setShowShareModal(true)}
        />,
      ]}
    >
      {shareModal}
      <Stack gap={2} justifyContent="flex-start" flex="auto">
        <Stack flex="auto">
          {settingsTree && enableNewTopNav && (
            <Stack padding={0.75}>
              <Typography variant="subtitle2">{t("panelName", { title })}</Typography>
            </Stack>
          )}
          {settingsTree || showTitleField ? (
            <SettingsTreeEditor
              key={selectedPanelId}
              settings={settingsTree ?? EMPTY_SETTINGS_TREE}
            />
          ) : (
            <Stack
              flex="auto"
              alignItems="center"
              justifyContent="center"
              paddingX={enableNewTopNav ? 1 : 0}
            >
              <Typography variant="body2" color="text.secondary" align="center">
                {t("panelDoesNotHaveSettings")}
              </Typography>
            </Stack>
          )}
        </Stack>
      </Stack>
    </SidebarContent>
  );
}
