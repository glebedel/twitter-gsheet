
const USERNAME = PropertiesService.getScriptProperties().getProperty('JIRA_USERNAME');
const PASSWORD = PropertiesService.getScriptProperties().getProperty('JIRA_PASSWORD');

const JIRA_BASE_DOMAIN = PropertiesService.getScriptProperties().getProperty('JIRA_BASE_DOMAIN');

const DEFAULT_MAX_RESULTS = 1000;
const MAX_REQUESTS = Number(
  PropertiesService.getScriptProperties().getProperty('MAX_JIRA_REQUESTS'),
);

const JIRA_ENDPOINTS_PATH = {
  BOARD_SPRINTS: (boardId: number, startAt: number = 0) =>
    `/rest/agile/latest/board/${boardId}/sprint?maxResults=${DEFAULT_MAX_RESULTS}&startAt=${startAt}`,
  SPRINT_REPORT: (boardId: number, sprintId: number = 0) =>
    `/rest/greenhopper/1.0/rapid/charts/sprintreport?rapidViewId=${boardId}&sprintId=${sprintId}`,
  VELOCITY_CHARTS: (boardId: number) =>
    `/rest/greenhopper/1.0/rapid/charts/velocity?rapidViewId=${boardId}`,
};

interface TransformRules {
  [key: string]: (value: any) => any;
}

const JIRA_DATA_TRANSFORM_BASE = {};

const flattenJiraIssueArray_ = (issues: JiraIssue[]) => issues.map((issue) => issue.key).join(',');
const getSprintEstimateValue_ = (sum: IssuesEstimateSum) => sum.value;
const noTransform_ = (value: any) => value;
const dateTransform = (dateString: string) => new Date(dateString).getTime();

const JIRA_DATA_TRANSFORM_SPRINT_REPORT = {
  ...JIRA_DATA_TRANSFORM_BASE,
  id: noTransform_,
  name: noTransform_,
  isoStartDate: noTransform_,
  isoEndDate: noTransform_,
  isoCompleteDate: noTransform_,
  daysRemaining: noTransform_,
  issuesNotCompletedInCurrentSprint: flattenJiraIssueArray_,
  completedIssues: flattenJiraIssueArray_,
  puntedIssues: flattenJiraIssueArray_,
  issueKeysAddedDuringSprint: (issueKeysObj: Object) => Object.keys(issueKeysObj).join(','),
  allIssuesEstimateSum: getSprintEstimateValue_,
  completedIssuesInitialEstimateSum: getSprintEstimateValue_,
  completedIssuesEstimateSum: getSprintEstimateValue_,
  issuesNotCompletedInitialEstimateSum: getSprintEstimateValue_,
  issuesNotCompletedEstimateSum: getSprintEstimateValue_,
  issuesCompletedInAnotherSprintInitialEstimateSum: getSprintEstimateValue_,
  issuesCompletedInAnotherSprintEstimateSum: getSprintEstimateValue_,
  puntedIssuesEstimateSum: getSprintEstimateValue_,
  puntedIssuesInitialEstimateSum: getSprintEstimateValue_,
};

const JIRA_DATA_TRANSFORM_VELOCITY_REPORT = {
  allConsideredIssueKeys: (issueKeys: string[]) => issueKeys.join(','),
  estimatedEntries: (sprintEntry: JiraSprintEntry[]) =>
    sprintEntry.map(({ issueKey }) => issueKey).join(','),
  completedEntries: (sprintEntry: JiraSprintEntry[]) =>
    sprintEntry.map(({ issueKey }) => issueKey).join(','),
  estimated: getSprintEstimateValue_,
  completed: getSprintEstimateValue_,
};

const JIRA_DATA_TRANSFORM_VELOCITY_REPORT_BASE_LEVEL = {
  sprints: noTransform_,
  velocityStatEntries: (
    sprintReports: JiraSprintsVelocityReportResponse['velocityStatEntries'],
  ) => {
    const transformed = {};
    for (let [sprintId, sprintData] of Object.entries(sprintReports)) {
      transformed[sprintId] = transformData_(sprintData, JIRA_DATA_TRANSFORM_VELOCITY_REPORT);
    }
    return transformed;
  },
};

function transformData_<T, I>(data: T, transformRules: TransformRules) {
  let transformed = {};
  for (let [key, transformFunction] of Object.entries(transformRules)) {
    transformed[key] = data.hasOwnProperty(key) ? transformFunction(data[key]) : 'N/A';
  }
  return transformed;
}

const getJiraData = (endpointPath: string) => {
  const headers = {
    Authorization: 'Basic ' + Utilities.base64Encode(USERNAME + ':' + PASSWORD),
  };

  const params = {
    method: 'get' as 'get',
    headers: headers,
  };

  const response = UrlFetchApp.fetch(`${JIRA_BASE_DOMAIN}${endpointPath}`, params);
  console.log({
    responseContent: response.getContentText(),
    responseHeaders: response.getAllHeaders(),
  });
  return JSON.parse(response.getContentText());
};

function getRawSprints(boardId: number, startAt?: number) {
  if (startAt === undefined) {
    startAt = 0;
  }

  let response: JiraSprintsResponse;
  let sprints: JiraSprint[] = [];
  let requestCounter = 0; // Keep count of requests made to avoid infinite loop if something goes wrong

  while (requestCounter < MAX_REQUESTS) {
    response = getJiraData(JIRA_ENDPOINTS_PATH.BOARD_SPRINTS(boardId, startAt));
    requestCounter++;
    startAt += response.values.length;
    sprints = [...sprints, ...response.values.filter((sprint) => sprint.originBoardId === boardId)];
    if (response.isLast) {
      // We've reached end of pagination
      break;
    }
  }
  return sprints;
}

/**
 * Flattens an object so there is no property nesting
 * { an: { object: true } } will become { an.object: true }
 * { property: ['a','b','c'] } will become { property.0 : 'a', property.1: 'b', property.2: 'c' }
 * @param data object to flatten
 */

function flattenObject_(data: any) {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  let flattened = {};
  for (let key in data) {
    if (data.hasOwnProperty(key) && typeof data[key] == 'object') {
      let flatObject = flattenObject_(data[key]);
      for (let subkey in flatObject) {
        if (flatObject.hasOwnProperty(subkey)) {
          flattened[key + '.' + subkey] = flatObject[subkey];
        }
      }
    } else {
      flattened[key] = data[key];
    }
  }
  return flattened;
}
function sheetifyObject_<T extends Object>(obj: T, props?: string[]) {
  props = props?.map((prop) => prop.toUpperCase());
  const objEntries = Object.entries(flattenObject_(obj));
  // if we don't want to extract specific properties in the object we get all the properties' values
  const filteredEntries =
    props === undefined
      ? objEntries
      : objEntries.filter(([key]) => props.includes(key.toUpperCase()));
  return filteredEntries.map(([, value]) => value);
}

function sheetifyObjectArray_<T extends Object>(objArray: T[], props?: string[]) {
  return objArray.map((obj) => sheetifyObject_(obj, props));
}

function getSprintReportHeaders() {
  return Object.keys(JIRA_DATA_TRANSFORM_SPRINT_REPORT);
}

function getSprints(boardId: number, propertiesToReturn?: string, startAt = 0) {
  const sprints = getRawSprints(boardId, startAt);
  const propNames = propertiesToReturn?.split(',');
  const sheetData = sheetifyObjectArray_(sprints, propNames);
  console.log('sprints data', sheetData.length, sheetData, propertiesToReturn);
  return sheetData;
}

function getSprintReport(boardId: number, sprintId: number, propertiesToReturn?: string) {
  const report: JiraSprintsReportResponse = getJiraData(
    JIRA_ENDPOINTS_PATH.SPRINT_REPORT(boardId, sprintId),
  );
  console.log('report', report);
  const propNames = propertiesToReturn?.split(',');
  const transformedReport = transformData_(
    {
      ...report.sprint,
      ...report.contents,
    },
    JIRA_DATA_TRANSFORM_SPRINT_REPORT,
  );

  console.log('transformedReport', transformedReport);
  return sheetifyObject_(transformedReport, propNames);
}

function getVelocityReport(boardId: number) {
  const report: JiraSprintsVelocityReportResponse = getJiraData(
    JIRA_ENDPOINTS_PATH.VELOCITY_CHARTS(boardId),
  );

  console.log('Velocity Charts Report', report);
  const { velocityStatEntries, sprints } = transformData_(
    report,
    JIRA_DATA_TRANSFORM_VELOCITY_REPORT_BASE_LEVEL,
  ) as TransformedJiraVelocityReport;

  console.log('Sprint Reports', velocityStatEntries, sprints);
  // Merge sprint property with velocity data
  const sprintsVelocityReport = sprints.map(({ id, name, goal, state }) => ({
    id,
    name,
    state,
    goal,
    ...velocityStatEntries[id],
  }));
  console.log('Merged Sprint Reports', sprintsVelocityReport);

  return sprintsVelocityReport.map((report) => sheetifyObject_(report));
}

export function getVelocityReports(boardIds: number[]) {
  return boardIds.map((boardId) => getVelocityReport(boardId));
}
