<?php
/**
 * Plugin Name: StripUnion Growth Bridge
 * Description: Dispatches newly published StripUnion Blog posts to the StripUnion GitHub Actions growth workflow.
 * Version: 0.2.0
 * Author: StripUnion
 * Requires at least: 6.5
 * Requires PHP: 8.1
 */

if (!defined('ABSPATH')) {
    exit;
}

final class StripUnion_Growth_Bridge {
    private const OPTION = 'stripunion_growth_bridge';
    private const META_STATUS = '_su_growth_dispatch_status';
    private const META_ATTEMPTS = '_su_growth_dispatch_attempts';
    private const CRON_HOOK = 'su_growth_bridge_dispatch_post';

    public static function boot(): void {
        add_action('admin_menu', [self::class, 'admin_menu']);
        add_action('admin_init', [self::class, 'register_settings']);
        add_action('admin_post_su_growth_bridge_test', [self::class, 'handle_test']);
        add_action('transition_post_status', [self::class, 'on_transition'], 10, 3);
        add_action(self::CRON_HOOK, [self::class, 'dispatch_post'], 10, 1);
    }

    public static function activate(): void {
        if (get_option(self::OPTION, null) === null) {
            add_option(self::OPTION, [
                'owner' => 'heavenskybird',
                'repo' => 'stripunion',
                'workflow' => 'social-distribution.yml',
                'ref' => 'main',
                'token' => '',
            ], '', false);
        }
    }

    public static function admin_menu(): void {
        add_options_page(
            'StripUnion Growth Bridge',
            'StripUnion Growth Bridge',
            'manage_options',
            'stripunion-growth-bridge',
            [self::class, 'render_settings']
        );
    }

    public static function register_settings(): void {
        register_setting(
            'stripunion_growth_bridge',
            self::OPTION,
            [
                'type' => 'array',
                'sanitize_callback' => [self::class, 'sanitize_settings'],
                'default' => [],
            ]
        );
    }

    public static function sanitize_settings($input): array {
        $existing = self::settings();
        $token = trim((string)($input['token'] ?? ''));

        return [
            'owner' => sanitize_text_field($input['owner'] ?? $existing['owner']),
            'repo' => sanitize_text_field($input['repo'] ?? $existing['repo']),
            'workflow' => sanitize_text_field($input['workflow'] ?? $existing['workflow']),
            'ref' => sanitize_text_field($input['ref'] ?? $existing['ref']),
            'token' => $token !== '' ? self::encrypt($token) : ($existing['token'] ?? ''),
        ];
    }

    private static function settings(): array {
        $defaults = [
            'owner' => 'heavenskybird',
            'repo' => 'stripunion',
            'workflow' => 'social-distribution.yml',
            'ref' => 'main',
            'token' => '',
        ];

        return wp_parse_args((array)get_option(self::OPTION, []), $defaults);
    }

    private static function encryption_key(): string {
        $material = (defined('AUTH_KEY') ? AUTH_KEY : '') . '|' .
            (defined('SECURE_AUTH_KEY') ? SECURE_AUTH_KEY : '') . '|stripunion-growth-bridge';
        return hash('sha256', $material, true);
    }

    private static function encrypt(string $plain): string {
        if ($plain === '') {
            return '';
        }

        if (!function_exists('openssl_encrypt')) {
            return 'plain:' . base64_encode($plain);
        }

        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt(
            $plain,
            'aes-256-gcm',
            self::encryption_key(),
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );

        if ($cipher === false) {
            return 'plain:' . base64_encode($plain);
        }

        return 'enc:' . base64_encode($iv . $tag . $cipher);
    }

    private static function decrypt(string $stored): string {
        if ($stored === '') {
            return '';
        }

        if (str_starts_with($stored, 'plain:')) {
            return (string)base64_decode(substr($stored, 6), true);
        }

        if (!str_starts_with($stored, 'enc:') || !function_exists('openssl_decrypt')) {
            return '';
        }

        $raw = base64_decode(substr($stored, 4), true);
        if ($raw === false || strlen($raw) < 29) {
            return '';
        }

        $iv = substr($raw, 0, 12);
        $tag = substr($raw, 12, 16);
        $cipher = substr($raw, 28);

        $plain = openssl_decrypt(
            $cipher,
            'aes-256-gcm',
            self::encryption_key(),
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );

        return $plain === false ? '' : $plain;
    }

    public static function render_settings(): void {
        if (!current_user_can('manage_options')) {
            return;
        }

        $settings = self::settings();
        $status = isset($_GET['su_bridge_status']) ? sanitize_key($_GET['su_bridge_status']) : '';

        if ($status === 'ok') {
            echo '<div class="notice notice-success is-dismissible"><p>GitHub workflow connection verified.</p></div>';
        } elseif ($status === 'error') {
            echo '<div class="notice notice-error is-dismissible"><p>Connection test failed. Check the token and repository settings.</p></div>';
        }
        ?>
        <div class="wrap">
            <h1>StripUnion Growth Bridge</h1>
            <p>Routes newly published blog posts to the StripUnion GitHub Actions social-distribution workflow. The GitHub token is encrypted before storage when OpenSSL is available.</p>

            <form method="post" action="options.php">
                <?php settings_fields('stripunion_growth_bridge'); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="su-owner">GitHub owner</label></th>
                        <td><input id="su-owner" name="<?php echo esc_attr(self::OPTION); ?>[owner]" type="text" class="regular-text" value="<?php echo esc_attr($settings['owner']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="su-repo">Repository</label></th>
                        <td><input id="su-repo" name="<?php echo esc_attr(self::OPTION); ?>[repo]" type="text" class="regular-text" value="<?php echo esc_attr($settings['repo']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="su-workflow">Workflow file</label></th>
                        <td><input id="su-workflow" name="<?php echo esc_attr(self::OPTION); ?>[workflow]" type="text" class="regular-text" value="<?php echo esc_attr($settings['workflow']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="su-ref">Git ref</label></th>
                        <td><input id="su-ref" name="<?php echo esc_attr(self::OPTION); ?>[ref]" type="text" class="regular-text" value="<?php echo esc_attr($settings['ref']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="su-token">Fine-grained GitHub token</label></th>
                        <td>
                            <input id="su-token" name="<?php echo esc_attr(self::OPTION); ?>[token]" type="password" class="regular-text" value="" autocomplete="new-password">
                            <p class="description">Leave blank to keep the currently stored token. Grant only Actions: Read and write for heavenskybird/stripunion.</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button('Save settings'); ?>
            </form>

            <hr>
            <h2>Connection test</h2>
            <p>This test reads workflow metadata only. It does not create an X post.</p>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <input type="hidden" name="action" value="su_growth_bridge_test">
                <?php wp_nonce_field('su_growth_bridge_test'); ?>
                <?php submit_button('Test GitHub connection', 'secondary', 'submit', false); ?>
            </form>
        </div>
        <?php
    }

    public static function handle_test(): void {
        if (!current_user_can('manage_options')) {
            wp_die('Forbidden', 403);
        }
        check_admin_referer('su_growth_bridge_test');

        $settings = self::settings();
        $token = self::decrypt((string)$settings['token']);
        $ok = false;

        if ($token !== '') {
            $url = sprintf(
                'https://api.github.com/repos/%s/%s/actions/workflows/%s',
                rawurlencode($settings['owner']),
                rawurlencode($settings['repo']),
                rawurlencode($settings['workflow'])
            );

            $response = wp_remote_get($url, [
                'timeout' => 10,
                'headers' => self::github_headers($token),
            ]);

            $ok = !is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200;
        }

        wp_safe_redirect(add_query_arg(
            ['page' => 'stripunion-growth-bridge', 'su_bridge_status' => $ok ? 'ok' : 'error'],
            admin_url('options-general.php')
        ));
        exit;
    }

    public static function on_transition(string $new_status, string $old_status, WP_Post $post): void {
        if ($new_status !== 'publish' || $old_status === 'publish' || $post->post_type !== 'post') {
            return;
        }

        if (wp_is_post_revision($post->ID) || wp_is_post_autosave($post->ID)) {
            return;
        }

        if (get_post_meta($post->ID, self::META_STATUS, true) === 'sent') {
            return;
        }

        // Dispatch immediately on first publish so the primary path does not depend
        // on WP-Cron traffic. WP-Cron remains a retry mechanism only.
        self::dispatch_post($post->ID);
    }

    public static function dispatch_post(int $post_id): void {
        if (get_post_meta($post_id, self::META_STATUS, true) === 'sent') {
            return;
        }

        $post = get_post($post_id);
        if (!$post instanceof WP_Post || $post->post_status !== 'publish' || $post->post_type !== 'post') {
            return;
        }

        $settings = self::settings();
        $token = self::decrypt((string)$settings['token']);

        if ($token === '') {
            self::retry($post_id, 'missing_token');
            return;
        }

        $excerpt = has_excerpt($post)
            ? get_the_excerpt($post)
            : wp_trim_words(wp_strip_all_tags(strip_shortcodes($post->post_content)), 35, '…');

        $body = [
            'ref' => $settings['ref'],
            'inputs' => [
                'title' => html_entity_decode(get_the_title($post), ENT_QUOTES | ENT_HTML5, 'UTF-8'),
                'url' => get_permalink($post),
                'excerpt' => $excerpt,
                'post_id' => (string)$post_id,
                'source' => 'wordpress',
            ],
        ];

        $url = sprintf(
            'https://api.github.com/repos/%s/%s/actions/workflows/%s/dispatches',
            rawurlencode($settings['owner']),
            rawurlencode($settings['repo']),
            rawurlencode($settings['workflow'])
        );

        $response = wp_remote_post($url, [
            'timeout' => 8,
            'headers' => self::github_headers($token),
            'body' => wp_json_encode($body),
        ]);

        if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 204) {
            update_post_meta($post_id, self::META_STATUS, 'sent');
            update_post_meta($post_id, '_su_growth_dispatched_at', current_time('mysql', true));
            delete_post_meta($post_id, self::META_ATTEMPTS);
            return;
        }

        $code = is_wp_error($response) ? $response->get_error_code() : wp_remote_retrieve_response_code($response);
        self::retry($post_id, (string)$code);
    }

    private static function github_headers(string $token): array {
        return [
            'Accept' => 'application/vnd.github+json',
            'Authorization' => 'Bearer ' . $token,
            'X-GitHub-Api-Version' => '2022-11-28',
            'Content-Type' => 'application/json',
            'User-Agent' => 'StripUnion-Growth-Bridge/0.2',
        ];
    }

    private static function retry(int $post_id, string $reason): void {
        $attempts = (int)get_post_meta($post_id, self::META_ATTEMPTS, true) + 1;
        update_post_meta($post_id, self::META_ATTEMPTS, $attempts);
        update_post_meta($post_id, '_su_growth_last_error', sanitize_text_field($reason));

        if ($attempts >= 3) {
            update_post_meta($post_id, self::META_STATUS, 'failed');
            return;
        }

        $delay = 300 * $attempts;
        if (!wp_next_scheduled(self::CRON_HOOK, [$post_id])) {
            wp_schedule_single_event(time() + $delay, self::CRON_HOOK, [$post_id]);
        }
    }
}

register_activation_hook(__FILE__, [StripUnion_Growth_Bridge::class, 'activate']);
StripUnion_Growth_Bridge::boot();
