/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const REPO = "mozilla-central";
const TH = "https://treeherder.mozilla.org";
const VARIANTS = ["beta", "release", "same"];
const BAD = new Set(["testfailed", "busted", "exception"]);

async function fetchJobs(days) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const jobs = [];
  let url = `${TH}/api/project/${REPO}/jobs/?job_group_symbol=DTbc&last_modified__gt=${since}&count=2000`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Treeherder returned ${res.status}`);
    }
    const data = await res.json();
    jobs.push(...data.results);
    url = data.next;
  }
  return jobs;
}

async function fetchRevisions(pushIds) {
  const revisions = new Map();
  if (!pushIds.length) {
    return revisions;
  }
  const res = await fetch(`${TH}/api/project/${REPO}/push/?id__in=${pushIds.join(",")}&count=${pushIds.length}`);
  if (res.ok) {
    for (const push of (await res.json()).results) {
      revisions.set(push.id, push.revision);
    }
  }
  return revisions;
}

function jobLink(job) {
  const status = job.state === "completed" ? job.result : job.state;
  const a = document.createElement("a");
  a.className = status;
  a.textContent = status;
  a.title = `${job.job_type_name}\ntask ${job.task_id}.${job.retry_id}`;
  a.href = `${TH}/logviewer?job_id=${job.id}&repo=${REPO}&task=${job.task_id}.${job.retry_id}`;
  a.target = "_blank";
  return a;
}

async function render() {
  const days = Number(document.getElementById("days").value) || 30;
  const failuresOnly = document.getElementById("failuresOnly").checked;
  const tbody = document.getElementById("rows");
  const summary = document.getElementById("summary");
  document.getElementById("error").textContent = "";
  summary.textContent = "Loading...";
  tbody.replaceChildren();

  let jobs;
  try {
    jobs = await fetchJobs(days);
  } catch (e) {
    document.getElementById("error").textContent = e.message;
    summary.textContent = "";
    return;
  }

  const byPush = new Map();
  for (const job of jobs) {
    if (!byPush.has(job.push_id)) {
      byPush.set(job.push_id, { time: job.submit_timestamp, jobs: [] });
    }
    const push = byPush.get(job.push_id);
    push.time = Math.min(push.time, job.submit_timestamp);
    push.jobs.push(job);
  }
  const revisions = await fetchRevisions([...byPush.keys()]);

  const pushes = [...byPush.entries()].sort((a, b) => b[1].time - a[1].time);
  let failures = 0;
  for (const [pushId, push] of pushes) {
    const hasFailure = push.jobs.some(j => BAD.has(j.result));
    if (hasFailure) {
      failures++;
    }
    if (failuresOnly && !hasFailure) {
      continue;
    }
    const tr = document.createElement("tr");
    const date = document.createElement("td");
    date.textContent = new Date(push.time * 1000).toISOString().slice(0, 10);
    const rev = document.createElement("td");
    const revision = revisions.get(pushId);
    if (revision) {
      const a = document.createElement("a");
      a.href = `${TH}/jobs?repo=${REPO}&revision=${revision}&searchStr=devtools-compat`;
      a.target = "_blank";
      a.textContent = revision.slice(0, 12);
      rev.append(a);
    }
    tr.append(date, rev);
    for (const variant of VARIANTS) {
      const td = document.createElement("td");
      td.className = "cell";
      push.jobs
        .filter(j => j.job_type_symbol === variant)
        .sort((a, b) => a.retry_id - b.retry_id)
        .forEach(j => td.append(jobLink(j)));
      tr.append(td);
    }
    tbody.append(tr);
  }
  summary.textContent = `${pushes.length} runs in the last ${days} days, ${failures} with failures.`;
}

document.getElementById("reload").addEventListener("click", render);
document.getElementById("failuresOnly").addEventListener("change", render);
document.getElementById("days").addEventListener("change", render);
render();