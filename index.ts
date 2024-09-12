import ObjectError from "../ObjectError/index.js";

const email_conf = (await import("../../email/email.conf.js")).default;
const mailer = (await import("nodemailer")).default;
const env = (await import("../../env.js")).default;
const client = (await import("../../database/prisma.js")).default;

const transporter = mailer.createTransport(email_conf);

const log_util = await import("$/server/utils/log/index.js");
const log = await log_util.local_log_decorator("MAILER", "white", true, "Info");

let verified = false;

async function verify() {
    if (!verified) {
        await transporter.verify();
        verified = true;
        log("mailer connected");
    }
}

async function save_mail(mail, isSent) {
    mail.status = isSent ? "sent" : "not_sent";
    await client.emails.create({
        data: {
            from: mail.from.address || mail.from || "",
            to: mail.to,
            cc: mail.cc,
            subject: mail.subject,
            email_text: mail.text,
            status: mail.status,
            created_by_user: !mail.use_id
                ? undefined
                : {
                      connect: {
                          user_id: mail.use_id,
                      },
                  },
            updated_by_user: !mail.use_id
                ? undefined
                : {
                      connect: {
                          user_id: mail.use_id,
                      },
                  },
        },
    });
    return;
}

export default {
    save_mail,
    transporter: transporter,
    /**
     *
     * sends email
     *
     * @param {Object} params
     *
     * - parameters
     *   - to // (optional, default admin email) could be string (one email), list (array) of emails
     *   - cc // (optional) same as to
     *   - subject // String
     *   - text // (optional) String
     *   - headers // (optional)
     *   - html // (optional),
     *   - user_id // the creator of email
     *
     *
     * @returns {Promise}
     * returned Object has
     *   - info
     *
     *   - mail
     *     - to // list of receiver in string
     *     - cc // list of cc in string
     *     - from // {name, address}
     *     - subject
     *     - status // 1->sent, 2->not sent
     *     - text // could be undefined
     *     - headers
     *     - html // html content, could be undefined
     *     - user_id // creator
     */
    send: async function (params) {
        /*
         *
         * takes input of
         *
         *
         * - params
         *   - to // list of receivers emails, default admin email in env
         *   - cc // list cc emails
         *   - subject
         *   - text
         *   - headers // email headers
         *   - html
         *   - html_file_path
         *   - user_id // the creator of email
         *
         */
        return new Promise(async (resolve, reject) => {
            try {
                await verify();
                if (!verified) {
                    throw new ObjectError({
                        status_code: env.response.status_codes.server_error,
                        msg: "Email Client Not Connected",
                    });
                }
                const mail = {
                    html: undefined as any,
                    html_file_path: undefined as any,
                    text: undefined as any,
                    from: params.from || {
                        address: email_conf.user_name || email_conf.from?.address || email_conf.from,
                        name: email_conf.name,
                    },
                    attachments: params.attachments,
                    to: Array.isArray(params.to) ? params.to.join(", ") : params.to,
                    cc: params.cc ? (Array.isArray(params.cc) ? params.cc.join(", ") : params.cc) : undefined,
                    subject: params.subject,
                    headers: params.headers || email_conf.headers,
                    user_id: params.user_id || 1,
                };
                const cb = async (err, info) => {
                    try {
                        if (err) {
                            console.log(err);
                            await save_mail(mail, false);
                            err.mail = mail;
                            return reject(err);
                        }
                        console.log(info);
                        await save_mail(mail, true);
                        /*
                         * returned doc has
                         *   - info
                         *
                         *   - mail
                         *     - to // list of receiver in string
                         *     - cc // list of cc in string
                         *     - from // {name, address}
                         *     - subject
                         *     - status // 1->sent, 2->not sent
                         *     - text // could be undefined
                         *     - headers
                         *     - template
                         *       - name
                         *       - render
                         *     - html_file // could be (undefined)
                         *       - data // buffer of html content
                         *       - buffer // data buffer)
                         *       - dir // under public dir
                         *       - html // html content
                         *       - saved // boolean
                         *       - mimetype // text/html
                         *       - name // full name
                         *       - path // full path
                         *       - size // bytes)
                         *     - html // html content, could be undefined
                         *     - user_id // creator
                         */
                        resolve({ info, mail });
                    } catch (error: any) {
                        log.error(error);
                        reject(error);
                    }
                };
                if (params.html) {
                    mail.html = params.html;
                    mail.html_file_path = params.html_file_path;
                    transporter.sendMail(mail, cb);
                } else {
                    mail.text = params.text;
                    transporter.sendMail(mail, cb);
                }
            } catch (error) {
                reject(error);
            }
        });
    },
};
