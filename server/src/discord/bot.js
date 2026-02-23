const { Client, GatewayIntentBits, Events } = require('discord.js');
const config = require('../config');
const {
  Users,
  UserDepartments,
  UserSubDepartments,
  DiscordRoleMappings,
  SubDepartments,
  FiveMJobSyncJobs,
  Settings,
} = require('../db/sqlite');
const qbox = require('../db/qbox');
const { audit } = require('../utils/audit');
const bus = require('../utils/eventBus');

let client = null;
const ADMIN_DISCORD_ROLE_ID = '1472592662103064617';
let roleSyncInterval = null;

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function normalizeGrade(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function normalizedJob(jobName, jobGrade, sourceType = 'none', sourceId = null) {
  const name = String(jobName || '').trim();
  if (!name) return null;
  return {
    job_name: name,
    job_grade: normalizeGrade(jobGrade),
    source_type: sourceType,
    source_id: sourceId ? Number(sourceId) : null,
  };
}

function getDefaultJobTarget() {
  const configuredName = String(Settings.get('fivem_bridge_job_sync_default_job') || '').trim();
  if (!configuredName) return null;
  const configuredGrade = normalizeGrade(Settings.get('fivem_bridge_job_sync_default_grade') || 0);
  return normalizedJob(configuredName, configuredGrade, 'fallback', null);
}

function getRoleRemovedJobTarget() {
  const configuredName = String(Settings.get('fivem_bridge_job_sync_removed_job') || 'unemployed').trim();
  if (!configuredName) return null;
  const configuredGrade = normalizeGrade(Settings.get('fivem_bridge_job_sync_removed_grade') || 0);
  return normalizedJob(configuredName, configuredGrade, 'none', null);
}

function isJobSyncEnabled() {
  // CAD -> QBX job sync is temporarily disabled.
  return false;
}

function isGameToDiscordJobSyncEnabled() {
  return toBool(Settings.get('fivem_bridge_job_sync_reverse_enabled'), true);
}

function normalizeJobNameKey(value) {
  return String(value || '').trim().toLowerCase();
}

function choosePreferredTarget(candidates = []) {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    if (b.job_grade !== a.job_grade) return b.job_grade - a.job_grade;
    return (a.source_id || 0) - (b.source_id || 0);
  })[0];
}

function computeDesiredJobTarget(departments, subDepartments, roleJobs = []) {
  const roleCandidates = (Array.isArray(roleJobs) ? roleJobs : [])
    .map(role => normalizedJob(role.job_name, role.job_grade, role.source_type, role.source_id))
    .filter(Boolean);
  const bestRole = choosePreferredTarget(roleCandidates);
  if (bestRole) return bestRole;

  const subCandidates = (Array.isArray(subDepartments) ? subDepartments : [])
    .map(sd => normalizedJob(sd.fivem_job_name, sd.fivem_job_grade, 'sub_department', sd.id))
    .filter(Boolean);
  const bestSub = choosePreferredTarget(subCandidates);
  if (bestSub) return bestSub;

  const deptCandidates = (Array.isArray(departments) ? departments : [])
    .map(d => normalizedJob(d.fivem_job_name, d.fivem_job_grade, 'department', d.id))
    .filter(Boolean);
  const bestDept = choosePreferredTarget(deptCandidates);
  if (bestDept) return bestDept;

  return getDefaultJobTarget();
}

function isSameJobTarget(left, right) {
  const a = left || null;
  const b = right || null;
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    String(a.job_name || '') === String(b.job_name || '')
    && normalizeGrade(a.job_grade) === normalizeGrade(b.job_grade)
    && String(a.source_type || '') === String(b.source_type || '')
    && Number(a.source_id || 0) === Number(b.source_id || 0)
  );
}

function getMappedTargets(memberRoleIds, mappings) {
  const departmentIds = new Set();
  const subDepartmentIds = new Set();
  const roleJobs = [];
  for (const mapping of mappings) {
    if (!memberRoleIds.has(mapping.discord_role_id)) continue;
    if (mapping.target_type === 'department' && mapping.target_id) {
      departmentIds.add(mapping.target_id);
    }
    if (mapping.target_type === 'sub_department' && mapping.target_id) {
      subDepartmentIds.add(mapping.target_id);
      const sub = SubDepartments.findById(mapping.target_id);
      if (sub?.department_id) {
        departmentIds.add(sub.department_id);
      }
    }
    if (mapping.target_type === 'job') {
      const mapped = normalizedJob(mapping.job_name, mapping.job_grade, 'fallback', mapping.id);
      if (mapped) roleJobs.push(mapped);
    }
  }
  return {
    departmentIds: [...departmentIds],
    subDepartmentIds: [...subDepartmentIds],
    roleJobs,
  };
}

function queueJobSyncIfNeeded(user, oldDepts, oldSubDepts, newDepts, newSubDepts, newRoleJobs = [], options = {}) {
  if (!isJobSyncEnabled()) return null;

  const allowRoleRemovalFallback = options.allowRoleRemovalFallback !== false;
  const beforeTarget = computeDesiredJobTarget(oldDepts, oldSubDepts);
  let afterTarget = computeDesiredJobTarget(newDepts, newSubDepts, newRoleJobs);
  const latestJob = FiveMJobSyncJobs.findLatestByUserId(user.id);
  if (!afterTarget) {
    const latestTargetName = String(latestJob?.job_name || '').trim();
    if (!allowRoleRemovalFallback) {
      if (!latestTargetName) return null;
      afterTarget = normalizedJob(
        latestJob.job_name,
        latestJob.job_grade,
        latestJob.source_type,
        latestJob.source_id
      );
    } else {
      const hadPriorTarget = !!beforeTarget || !!latestTargetName;
      if (!hadPriorTarget) return null;
      afterTarget = getRoleRemovedJobTarget();
    }
    if (!afterTarget) return null;
  }

  const preferredCitizenId = String(user.preferred_citizen_id || '').trim();
  if (!latestJob && isSameJobTarget(beforeTarget, afterTarget)) {
    return null;
  }
  if (latestJob) {
    const latestTarget = normalizedJob(
      latestJob.job_name,
      latestJob.job_grade,
      latestJob.source_type,
      latestJob.source_id
    );
    const latestCitizen = String(latestJob.citizen_id || '').trim();
    if (isSameJobTarget(latestTarget, afterTarget) && latestCitizen === preferredCitizenId) return null;
  }

  const job = FiveMJobSyncJobs.createOrReplacePending({
    user_id: user.id,
    steam_id: user.steam_id,
    discord_id: user.discord_id || '',
    citizen_id: preferredCitizenId,
    job_name: afterTarget.job_name,
    job_grade: afterTarget.job_grade,
    source_type: afterTarget.source_type,
    source_id: afterTarget.source_id,
  });

  audit(user.id, 'fivem_job_sync_queued', {
    discordId: user.discord_id,
    preferredCitizenId,
    before: beforeTarget,
    after: afterTarget,
    jobSyncJobId: job?.id || null,
  });

  return job;
}

async function syncJobRolesFromGame(user, member, mappings) {
  if (!isGameToDiscordJobSyncEnabled()) {
    return { enabled: false, changed: false, reason: 'disabled' };
  }

  const jobMappings = (Array.isArray(mappings) ? mappings : [])
    .filter(mapping => mapping.target_type === 'job' && String(mapping.discord_role_id || '').trim() !== '');
  if (jobMappings.length === 0) {
    return { enabled: true, changed: false, reason: 'no_job_mappings' };
  }

  const citizenId = String(user.preferred_citizen_id || '').trim();
  if (!citizenId) {
    return { enabled: true, changed: false, reason: 'no_preferred_citizen_id' };
  }

  let gameJobs = [];
  try {
    if (typeof qbox.getPlayerCharacterJobsByCitizenId === 'function') {
      const characterJobs = await qbox.getPlayerCharacterJobsByCitizenId(citizenId);
      if (Array.isArray(characterJobs)) {
        gameJobs = characterJobs
          .map(job => ({
            name: String(job?.name || '').trim(),
            grade: normalizeGrade(job?.grade || 0),
            citizenid: String(job?.citizenid || '').trim(),
          }))
          .filter(job => job.name);
      }
    }
    if (gameJobs.length === 0) {
      const gameJob = await qbox.getCharacterJobById(citizenId);
      const name = String(gameJob?.name || '').trim();
      if (name) {
        gameJobs = [{
          name,
          grade: normalizeGrade(gameJob?.grade || 0),
          citizenid: String(gameJob?.citizenid || citizenId || '').trim(),
        }];
      }
    }
  } catch (err) {
    const msg = String(err?.message || err || 'Unknown QBX lookup error');
    console.warn(`[Discord] Reverse job role sync lookup failed for user ${user.id} (${citizenId}): ${msg}`);
    return { enabled: true, changed: false, reason: 'lookup_failed', error: msg };
  }

  const dedupedGameJobs = Array.from(new Map(
    gameJobs.map((job) => {
      const name = String(job?.name || '').trim();
      const grade = normalizeGrade(job?.grade || 0);
      const rowCitizenId = String(job?.citizenid || '').trim();
      return [`${normalizeJobNameKey(name)}::${grade}`, { name, grade, citizenid: rowCitizenId }];
    })
  ).values()).filter(job => job.name);
  const primaryJob = dedupedGameJobs[0] || null;
  const characterJobsSummary = dedupedGameJobs.map(job => ({
    citizen_id: String(job.citizenid || '').trim(),
    job_name: job.name,
    job_grade: normalizeGrade(job.grade),
  }));

  const desiredRoleIds = new Set(
    jobMappings
      .filter((mapping) => dedupedGameJobs.some((job) => (
        normalizeJobNameKey(mapping.job_name) === normalizeJobNameKey(job.name)
        && normalizeGrade(mapping.job_grade) === normalizeGrade(job.grade)
      )))
      .map(mapping => String(mapping.discord_role_id))
  );
  const managedRoleIds = new Set(jobMappings.map(mapping => String(mapping.discord_role_id)));
  const currentRoleIds = new Set(member.roles.cache.map(role => String(role.id)));

  const toAdd = [];
  const toRemove = [];

  for (const roleId of desiredRoleIds) {
    if (!currentRoleIds.has(roleId)) {
      toAdd.push(roleId);
    }
  }
  for (const roleId of currentRoleIds) {
    if (managedRoleIds.has(roleId) && !desiredRoleIds.has(roleId)) {
      toRemove.push(roleId);
    }
  }

  if (toAdd.length === 0 && toRemove.length === 0) {
    return {
      enabled: true,
      changed: false,
      reason: primaryJob ? 'already_synced' : 'no_game_jobs',
      job_name: primaryJob?.name || '',
      job_grade: primaryJob ? normalizeGrade(primaryJob.grade) : 0,
      job_groups: characterJobsSummary.map(job => ({ job_name: job.job_name, job_grade: job.job_grade })),
      character_jobs: characterJobsSummary,
    };
  }

  const addedRoles = [];
  const removedRoles = [];
  const errors = [];

  for (const roleId of toAdd) {
    try {
      await member.roles.add(roleId, `CAD reverse job sync (${dedupedGameJobs.length} character job(s))`);
      addedRoles.push(roleId);
    } catch (err) {
      errors.push(`add ${roleId}: ${String(err?.message || err || 'unknown error')}`);
    }
  }
  for (const roleId of toRemove) {
    try {
      await member.roles.remove(roleId, `CAD reverse job sync (${dedupedGameJobs.length} character job(s))`);
      removedRoles.push(roleId);
    } catch (err) {
      errors.push(`remove ${roleId}: ${String(err?.message || err || 'unknown error')}`);
    }
  }

  if (addedRoles.length > 0 || removedRoles.length > 0 || errors.length > 0) {
    audit(user.id, 'discord_job_role_sync_from_game', {
      discordId: user.discord_id,
      citizenId,
      job_name: primaryJob?.name || '',
      job_grade: primaryJob ? normalizeGrade(primaryJob.grade) : 0,
      job_groups: characterJobsSummary.map(job => ({ job_name: job.job_name, job_grade: job.job_grade })),
      character_jobs: characterJobsSummary,
      added_roles: addedRoles,
      removed_roles: removedRoles,
      errors,
    });
  }

  return {
    enabled: true,
    changed: addedRoles.length > 0 || removedRoles.length > 0,
    reason: errors.length > 0 ? 'partial' : 'synced',
    job_name: primaryJob?.name || '',
    job_grade: primaryJob ? normalizeGrade(primaryJob.grade) : 0,
    job_groups: characterJobsSummary.map(job => ({ job_name: job.job_name, job_grade: job.job_grade })),
    character_jobs: characterJobsSummary,
    added_roles: addedRoles,
    removed_roles: removedRoles,
    errors,
  };
}

async function syncLinkedUserAccess(user, member, mappings) {
  const reverseJobSync = await syncJobRolesFromGame(user, member, mappings);
  const memberRoleIds = new Set(member.roles.cache.map(r => r.id));
  const hasAdminRole = memberRoleIds.has(ADMIN_DISCORD_ROLE_ID);
  const { departmentIds, subDepartmentIds, roleJobs } = getMappedTargets(memberRoleIds, mappings);

  const oldDepts = UserDepartments.getForUser(user.id);
  const oldSubDepts = UserSubDepartments.getForUser(user.id);
  const oldIsAdmin = !!user.is_admin;

  UserDepartments.setForUser(user.id, departmentIds);
  UserSubDepartments.setForUser(user.id, subDepartmentIds);
  if (hasAdminRole !== oldIsAdmin) {
    Users.update(user.id, { is_admin: hasAdminRole ? 1 : 0 });
  }

  const newDepts = UserDepartments.getForUser(user.id);
  const newSubDepts = UserSubDepartments.getForUser(user.id);
  const newIsAdmin = !!(Users.findById(user.id)?.is_admin);

  const oldIds = oldDepts.map(d => d.id).sort().join(',');
  const newIds = newDepts.map(d => d.id).sort().join(',');
  if (oldIds !== newIds) {
    audit(user.id, 'department_sync', {
      discordId: user.discord_id,
      before: oldDepts.map(d => d.short_name),
      after: newDepts.map(d => d.short_name),
    });
    bus.emit('sync:department', { userId: user.id, departments: newDepts });
  }

  const oldSubIds = oldSubDepts.map(d => d.id).sort().join(',');
  const newSubIds = newSubDepts.map(d => d.id).sort().join(',');
  if (oldSubIds !== newSubIds) {
    audit(user.id, 'sub_department_sync', {
      discordId: user.discord_id,
      before: oldSubDepts.map(d => d.short_name),
      after: newSubDepts.map(d => d.short_name),
    });
  }

  if (oldIsAdmin !== newIsAdmin) {
    audit(user.id, 'admin_sync', {
      discordId: user.discord_id,
      before: oldIsAdmin,
      after: newIsAdmin,
      roleId: ADMIN_DISCORD_ROLE_ID,
    });
  }

  const queuedJob = queueJobSyncIfNeeded(user, oldDepts, oldSubDepts, newDepts, newSubDepts, roleJobs, {
    allowRoleRemovalFallback: true,
  });

  return {
    is_admin: newIsAdmin,
    departments: newDepts,
    sub_departments: newSubDepts,
    reverse_job_role_sync: reverseJobSync,
    queued_job_sync_id: queuedJob?.id || null,
  };
}

async function startBot() {
  if (!config.discord.botToken) {
    console.warn('DISCORD_BOT_TOKEN not set - Discord bot disabled');
    return null;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
  });

  client.on(Events.ClientReady, () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
  });

  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    if (newMember.guild.id !== config.discord.guildId) return;

    const oldRoles = new Set(oldMember.roles.cache.map(r => r.id));
    const newRoles = new Set(newMember.roles.cache.map(r => r.id));

    // Check if roles actually changed
    if (oldRoles.size === newRoles.size && [...oldRoles].every(r => newRoles.has(r))) return;

    syncUserRoles(newMember.id).catch(err => {
      console.error('Role sync error for', newMember.id, err.message);
    });
  });

  await client.login(config.discord.botToken);
  startPeriodicRoleSync();
  return client;
}

function startPeriodicRoleSync() {
  const minutes = Number(config.discord.periodicSyncMinutes || 0);
  if (minutes <= 0) return;
  if (roleSyncInterval) return;

  syncAllMembers()
    .then(result => {
      console.log(`[Discord] Initial role sync complete: ${result.synced} synced, ${result.skipped} skipped`);
    })
    .catch(err => {
      console.error('[Discord] Initial role sync failed:', err.message);
    });

  const intervalMs = minutes * 60 * 1000;
  roleSyncInterval = setInterval(async () => {
    try {
      const result = await syncAllMembers();
      console.log(`[Discord] Periodic role sync complete: ${result.synced} synced, ${result.skipped} skipped`);
    } catch (err) {
      console.error('[Discord] Periodic role sync failed:', err.message);
    }
  }, intervalMs);

  console.log(`[Discord] Periodic role sync enabled every ${minutes} minute(s)`);
}

async function syncUserRoles(discordId) {
  const user = Users.findByDiscordId(discordId);
  if (!user) return { synced: false, reason: 'User not linked' };

  if (!client) return { synced: false, reason: 'Bot not running' };

  const guild = client.guilds.cache.get(config.discord.guildId);
  if (!guild) return { synced: false, reason: 'Guild not found' };

  let member;
  try {
    member = await guild.members.fetch(discordId);
  } catch {
    return { synced: false, reason: 'Member not in guild' };
  }

  const mappings = DiscordRoleMappings.list();
  const synced = await syncLinkedUserAccess(user, member, mappings);

  return {
    synced: true,
    is_admin: synced.is_admin,
    departments: synced.departments.map(d => d.short_name),
    sub_departments: synced.sub_departments.map(d => d.short_name),
    reverse_job_role_sync: synced.reverse_job_role_sync,
    queued_job_sync_id: synced.queued_job_sync_id,
  };
}

async function syncAllMembers() {
  if (!client) throw new Error('Bot not running');

  const guild = client.guilds.cache.get(config.discord.guildId);
  if (!guild) throw new Error('Guild not found');

  const members = await guild.members.fetch();
  const mappings = DiscordRoleMappings.list();
  let synced = 0;
  let skipped = 0;

  for (const [, member] of members) {
    const user = Users.findByDiscordId(member.id);
    if (!user) { skipped++; continue; }
    await syncLinkedUserAccess(user, member, mappings);
    synced++;
  }

  return { synced, skipped, total: members.size };
}

async function getGuildRoles() {
  if (!client) throw new Error('Bot not running');

  const guild = client.guilds.cache.get(config.discord.guildId);
  if (!guild) throw new Error('Guild not found');

  return guild.roles.cache
    .filter(r => r.id !== guild.id) // Exclude @everyone
    .sort((a, b) => b.position - a.position)
    .map(r => ({
      id: r.id,
      name: r.name,
      color: r.hexColor,
      position: r.position,
    }));
}

function getClient() {
  return client;
}

module.exports = { startBot, syncUserRoles, syncAllMembers, getGuildRoles, getClient };
