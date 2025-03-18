const Docker = require('dockerode');
const nodemailer = require('nodemailer');
require('dotenv').config();

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT, 10),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: process.env.EMAIL_SECURE === 'true' ? true : false,
  },
});

const previousStates = new Map();

const emailHeader = `
  <div style="background-color: #ffffff; padding: 20px; text-align: center;">
    <img src="https://avatars.githubusercontent.com/u/5429470?s=200&v=4" alt="Docker Logo" style="max-width: 200px;">
  </div>
  <div style="padding: 20px; font-family: Arial, sans-serif; color: #333;">
    <h2 style="color: #0db7ed;">Docker Monitor Alert</h2>
`;

const emailFooter = `
    <p style="font-size: 12px; color: #777;">Powered by Docker Monitor | Sent on ${new Date().toLocaleString()}</p>
  </div>
`;

async function checkDockerStatus() {
  try {
    const containers = await docker.listContainers({ all: true });
    for (const container of containers) {
      const containerId = container.Id;
      const name = container.Names[0].replace(/^\//, '');
      const state = container.State;
      const status = container.Status;
      const health = container.Status.includes('unhealthy') ? 'unhealthy' : 'healthy';

      const key = `container:${containerId}`;
      const prevData = previousStates.get(key) || { status: null, firstNotified: null, reminderSent: false };

      const isIssue = state !== 'running' || health === 'unhealthy';
      const statusChanged = prevData.status !== status;
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;

      if (isIssue) {
        if (!prevData.firstNotified && statusChanged) {
          const message = `
            ${emailHeader}
            <p><strong>Container Issue Detected</strong></p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Name:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${name}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>ID:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${containerId}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>State:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">
                ${state !== 'running' ? '<i class="fa fa-times-circle" style="color: #d9534f;"></i>' : '<i class="fa fa-check-circle" style="color: #5cb85c;"></i>'} ${state}
              </td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Status:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${status}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Health:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">
                ${health === 'unhealthy' ? '<i class="fa fa-times-circle" style="color: #d9534f;"></i>' : '<i class="fa fa-check-circle" style="color: #5cb85c;"></i>'} ${health}
              </td></tr>
            </table>
            ${emailFooter}
          `;
          await sendEmail('Docker Container Alert', message);
          previousStates.set(key, { status, firstNotified: now, reminderSent: false });
        }
        else if (prevData.firstNotified && !prevData.reminderSent && (now - prevData.firstNotified) >= oneHour) {
          const message = `
            ${emailHeader}
            <p><strong>Container Issue Reminder</strong></p>
            <p>The following container is still experiencing an issue after 1 hour:</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Name:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${name}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>ID:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${containerId}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>State:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">
                ${state !== 'running' ? '<i class="fa fa-times-circle" style="color: #d9534f;"></i>' : '<i class="fa fa-check-circle" style="color: #5cb85c;"></i>'} ${state}
              </td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Status:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${status}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Health:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">
                ${health === 'unhealthy' ? '<i class="fa fa-times-circle" style="color: #d9534f;"></i>' : '<i class="fa fa-check-circle" style="color: #5cb85c;"></i>'} ${health}
              </td></tr>
            </table>
            ${emailFooter}
          `;
          await sendEmail('Docker Container Reminder', message);
          previousStates.set(key, { status, firstNotified: prevData.firstNotified, reminderSent: true });
        }
      } else {
        previousStates.delete(key);
      }
    }

    const info = await docker.info();
    const isSwarmActive = info.Swarm && info.Swarm.LocalNodeState === 'active';

    if (isSwarmActive) {
      const services = await docker.listServices();
      for (const service of services) {
        const serviceId = service.ID;
        const name = service.Spec.Name;
        const key = `service:${serviceId}`;
        const prevData = previousStates.get(key) || { status: null, firstNotified: null, reminderSent: false };

        const serviceInfo = await docker.getService(serviceId).inspect();
        const runningTasks = serviceInfo.Spec.TaskTemplate.ContainerSpec ? true : false;
        const tasks = await docker.listTasks({ filters: { service: [name] } });
        const unhealthyTasks = tasks.some(task => task.Status.State === 'failed' || task.Status.State === 'rejected');
        const isIssue = !runningTasks || unhealthyTasks;
        const statusChanged = prevData.status !== serviceId;
        const now = Date.now();

        if (isIssue) {
          if (!prevData.firstNotified && statusChanged) {
            const message = `
              ${emailHeader}
              <p><strong>Stack/Service Issue Detected</strong></p>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Name:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${name}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>ID:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${serviceId}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Running:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">
                  ${runningTasks ? '<i class="fa fa-check-circle" style="color: #5cb85c;"></i> Yes' : '<i class="fa fa-times-circle" style="color: #d9534f;"></i> No'}
                </td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Unhealthy Tasks:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">
                  ${unhealthyTasks ? '<i class="fa fa-times-circle" style="color: #d9534f;"></i> Yes' : '<i class="fa fa-check-circle" style="color: #5cb85c;"></i> No'}
                </td></tr>
              </table>
              ${emailFooter}
            `;
            await sendEmail('Docker Stack Alert', message);
            previousStates.set(key, { status: serviceId, firstNotified: now, reminderSent: false });
          } else if (prevData.firstNotified && !prevData.reminderSent && (now - prevData.firstNotified) >= oneHour) {
            const message = `
              ${emailHeader}
              <p><strong>Stack/Service Issue Reminder</strong></p>
              <p>The following stack/service is still experiencing an issue after 1 hour:</p>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Name:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${name}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>ID:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${serviceId}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Running:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">
                  ${runningTasks ? '<i class="fa fa-check-circle" style="color: #5cb85c;"></i> Yes' : '<i class="fa fa-times-circle" style="color: #d9534f;"></i> No'}
                </td></tr>
                <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Unhealthy Tasks:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">
                  ${unhealthyTasks ? '<i class="fa fa-times-circle" style="color: #d9534f;"></i> Yes' : '<i class="fa fa-check-circle" style="color: #5cb85c;"></i> No'}
                </td></tr>
              </table>
              ${emailFooter}
            `;
            await sendEmail('Docker Stack Reminder', message);
            previousStates.set(key, { status: serviceId, firstNotified: prevData.firstNotified, reminderSent: true });
          }
        } else {
          previousStates.delete(key);
        }
      }
    }
  } catch (error) {
    console.error('Error checking Docker status:', error);
    const errorMessage = `
      ${emailHeader}
      <p><strong>Docker Monitor Error</strong></p>
      <p><i class="fa fa-exclamation-triangle" style="color: #d9534f;"></i> An error occurred: ${error.message}</p>
      ${emailFooter}
    `;
    await sendEmail('Docker Monitor Error', errorMessage);
  }
}

async function sendEmail(subject, html) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_TO,
      subject,
      html: `
        <html>
          <head>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
          </head>
          <body>
            ${html}
          </body>
        </html>
      `,
    });
    console.log(`Email sent: ${subject}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

const interval = parseInt(process.env.CHECK_INTERVAL, 10) || 60000;
setInterval(checkDockerStatus, interval);

checkDockerStatus();

console.log(`Docker monitor started. Checking every ${interval / 1000} seconds.`);