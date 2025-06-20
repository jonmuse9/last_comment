import api, { route } from "@forge/api";

const getIssueField = async (issueId, field) => {
  const response = await api
    .asApp()
    .requestJira(route`/rest/api/3/issue/${issueId}`);
  const data = await response.json();
  return data.fields[field];
};

const getComments = async (issueId) => {
  const response = await api
    .asApp()
    .requestJira(route`/rest/api/3/issue/${issueId}/comment`);
  const data = await response.json();
  return data.comments;
};

const getHistory = async (issueId) => {
  const response = await api
    .asApp()
    .requestJira(route`/rest/api/3/issue/${issueId}/history`);
  const data = await response.json();
  return data.histories || [];
};

const getPreviousAssigneeFromHistory = async (issueId) => {
  const histories = await getHistory(issueId);
  const previousAssignee = histories.find((history) => {
    return history.items.find((item) => {
      return item.field === "assignee" && item.fromString !== null;
    });
  });
  if (previousAssignee) {
    const previousAssigneeId = previousAssignee.items.find((item) => {
      return item.field === "assignee";
    }).fromString;
    const previousAssigneeResponse = await api
      .asApp()
      .requestJira(route`/rest/api/3/user?accountId=${previousAssigneeId}`);
    const previousAssigneeData = await previousAssigneeResponse.json();
    return previousAssigneeData;
  } else {
    return null;
  }
};

export const getLastCommentFromUser = async (args, user) => {
  const issue = args.issues[0];
  const comments = await getComments(issue.id);
  if (comments.length === 0) {
    return null;
  }
  const commentsFromUser = comments.filter(
    (comment) => comment.author.displayName === user.displayName
  );
  if (commentsFromUser.length === 0) {
    return null;
  }
  const lastCommentFromUser = commentsFromUser[commentsFromUser.length - 1];
  return lastCommentFromUser;
};

export const getFirstComment = async (args) => {
  return Promise.all(
    args.issues.map(async (issue) => {
      const comments = await getComments(issue.id);
      if (comments.length === 0) {
        return null;
      }
      const firstComment = comments[0];
      return firstComment.body.content[0].content[0].text;
    })
  );
};

export const getFirstCommenter = async (args) => {
  return Promise.all(
    args.issues.map(async (issue) => {
      const comments = await getComments(issue.id);
      if (comments.length === 0) {
        return null;
      }
      const firstComment = comments[0];
      return firstComment.author.displayName;
    })
  );
};

export const getLastComment = async (args) => {
  return Promise.all(
    args.issues.map(async (issue) => {
      const comments = await getComments(issue.id);
      if (comments.length === 0) {
        return null;
      }
      const lastComment = comments[comments.length - 1];
      return `${lastComment.author.displayName}: ${lastComment.body.content[0].content[0].text}`;
    })
  );
};

export const getLastCommenter = async (args) => {
  return Promise.all(
    args.issues.map(async (issue) => {
      const comments = await getComments(issue.id);
      if (comments.length === 0) {
        return null;
      }
      const lastComment = comments[comments.length - 1];
      return lastComment.author.displayName;
    })
  );
};

export const getCommentCount = async (args) => {
  return Promise.all(
    args.issues.map(async (issue) => {
      const comments = await getComments(issue.id);
      return comments.length;
    })
  );
};

export const getInternalCommentCount = async (args) => {
  return Promise.all(
    args.issues.map(async (issue) => {
      const comments = await getComments(issue.id);
      // Defensive: comments may be an array, not an object with .comments
      // Jira API returns { comments: [...] }, but getComments returns data.comments (array)
      // So comments is already an array
      if (!Array.isArray(comments)) {
        // Defensive fallback for unexpected structure
        return 0;
      }
      // Some Jira instances may use 'jsdPublic' or 'internal' flags, but default to 'internal' property
      const internalComments = comments.filter(
        (comment) => comment.internal === true
      );
      return internalComments.length;
    })
  );
};

export const getLastCommentDate = async (args) => {
  return Promise.all(
    args.issues.map(async (issue) => {
      const comments = await getComments(issue.id);
      if (comments.length === 0) {
        return null;
      }
      const lastComment = comments[comments.length - 1];
      return lastComment.created;
    })
  );
};

export const getFirstCommentDate = async (args) => {
  return Promise.all(
    args.issues.map(async (issue) => {
      const comments = await getComments(issue.id);
      if (comments.length === 0) {
        return null;
      }
      const firstComment = comments[0];
      return firstComment.created;
    })
  );
};

export const getLastAssigneeCommentDate = async (args) => {
  return Promise.all(
    args.issues.map(async (issue) => {
      const comments = await getComments(issue.id);
      if (comments.length === 0) {
        return null;
      }
      const previousAssignee = await getPreviousAssigneeFromHistory(
        issue.issueId
      );
      if (!previousAssignee) {
        return null;
      }
      const lastComment = getLastCommentFromUser(comments, previousAssignee);
      if (!lastComment) {
        return null;
      }
      if (lastComment.author.displayName === previousAssignee.displayName) {
        return lastComment.created;
      } else {
        return null;
      }
    })
  );
};

export const isFirstCommenterAssignee = async (args) => {
  return Promise.all(
    args.issues.map(async (issue) => {
      const comments = await getComments(issue.id);
      if (comments.length === 0) {
        return null;
      }
      const firstComment = comments[0];
      const assignee = await getIssueField(issue.id, "assignee");
      if (!assignee) {
        return null; // or some other default value
      }
      return firstComment.author.displayName === assignee.displayName
        ? "True"
        : "False";
    })
  );
};

export const isFirstCommenterCreator = async (args) => {
  return Promise.all(
    args.issues.map(async (issue) => {
      const comments = await getComments(issue.id);
      if (comments.length === 0) {
        return null;
      }
      const firstComment = comments[0];
      const creator = await getIssueField(issue.id, "creator");
      if (!creator) {
        return null; // or some other default value
      }
      return firstComment.author.displayName === creator.displayName
        ? "True"
        : "False";
    })
  );
};

export const isFirstCommenterReporter = async (args) => {
  return Promise.all(
    args.issues.map(async (issue) => {
      const comments = await getComments(issue.id);
      if (comments.length === 0) {
        return null;
      }
      const firstComment = comments[0];
      const reporter = await getIssueField(issue.id, "reporter");
      if (!reporter) {
        return null; // or some other default value
      }
      return firstComment.author.displayName === reporter.displayName
        ? "True"
        : "False";
    })
  );
};

export const isLastCommenterAssignee = async (args) => {
  return Promise.all(
    args.issues.map(async (issue) => {
      const comments = await getComments(issue.id);
      if (comments.length === 0) {
        return null;
      }
      const lastComment = comments[comments.length - 1];
      const assignee = await getIssueField(issue.id, "assignee");
      if (!assignee) {
        return null; // or some other default value
      }
      return lastComment.author.displayName === assignee.displayName
        ? "True"
        : "False";
    })
  );
};

export const isLastCommenterReporter = async (args) => {
  return Promise.all(
    args.issues.map(async (issue) => {
      const comments = await getComments(issue.id);
      if (comments.length === 0) {
        return null;
      }
      const lastComment = comments[comments.length - 1];
      const reporter = await getIssueField(issue.id, "reporter");
      if (!reporter) {
        return null; // or some other default value
      }
      return lastComment.author.displayName === reporter.displayName
        ? "True"
        : "False";
    })
  );
};

export const isLastCommenterCreator = async (args) => {
  return Promise.all(
    args.issues.map(async (issue) => {
      const comments = await getComments(issue.id);
      if (comments.length === 0) {
        return null;
      }
      const lastComment = comments[comments.length - 1];
      const creator = await getIssueField(issue.id, "creator");
      if (!creator) {
        return null; // or some other default value
      }
      return lastComment.author.displayName === creator.displayName
        ? "True"
        : "False";
    })
  );
};
