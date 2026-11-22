<?php
/**
 * Página Configurações › Radar Lotérico: URL do sistema, chave da API, cache e teste de conexão.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'admin_menu', 'radar_loterico_menu' );
function radar_loterico_menu() {
	add_options_page( 'Radar Lotérico', 'Radar Lotérico', 'manage_options', 'radar-loterico', 'radar_loterico_pagina' );
}

add_action( 'admin_init', 'radar_loterico_registrar_config' );
function radar_loterico_registrar_config() {
	register_setting(
		'radar_loterico',
		RADAR_LOTERICO_OPCAO,
		array(
			'type'              => 'array',
			'sanitize_callback' => 'radar_loterico_sanitizar',
			'default'           => array(),
			'show_in_rest'      => false,
		)
	);
}

function radar_loterico_sanitizar( $entrada ) {
	$atual = radar_loterico_config();
	$url   = isset( $entrada['url'] ) ? esc_url_raw( trim( (string) $entrada['url'] ), array( 'https', 'http' ) ) : '';
	$chave = isset( $entrada['chave'] ) ? sanitize_text_field( (string) $entrada['chave'] ) : '';
	if ( '' === $chave ) {
		// campo de senha vazio = manter a chave já salva
		$chave = $atual['chave'];
	}
	if ( '' !== $url && 0 !== strpos( $url, 'https://' ) ) {
		add_settings_error( RADAR_LOTERICO_OPCAO, 'radar_http', __( 'Use o endereço com https:// (a chave da API viaja nesta conexão).', 'radar-loterico' ), 'warning' );
	}
	radar_loterico_limpar_cache();
	return array(
		'url'           => untrailingslashit( $url ),
		'chave'         => $chave,
		'cache_minutos' => isset( $entrada['cache_minutos'] ) ? max( 1, min( 1440, (int) $entrada['cache_minutos'] ) ) : 10,
		'verificar_ssl' => empty( $entrada['verificar_ssl'] ) ? 0 : 1,
	);
}

add_action( 'admin_post_radar_loterico_testar', 'radar_loterico_testar' );
function radar_loterico_testar() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'Sem permissão.', 'radar-loterico' ) );
	}
	check_admin_referer( 'radar_loterico_testar' );
	$r = radar_loterico_api( 'conta', array(), false );
	if ( is_wp_error( $r ) ) {
		$msg = 'erro:' . $r->get_error_message();
	} else {
		$lojas = isset( $r['lojas'] ) && is_array( $r['lojas'] ) ? count( $r['lojas'] ) : 0;
		/* translators: 1: nome da conta, 2: número de lotéricas */
		$msg = 'ok:' . sprintf( __( 'Conectado à conta "%1$s" (%2$d lotérica(s)).', 'radar-loterico' ), isset( $r['conta'] ) ? (string) $r['conta'] : '—', $lojas );
	}
	set_transient( 'radar_loterico_teste_' . get_current_user_id(), $msg, 60 );
	wp_safe_redirect( admin_url( 'options-general.php?page=radar-loterico' ) );
	exit;
}

add_action( 'admin_post_radar_loterico_limpar', 'radar_loterico_acao_limpar' );
function radar_loterico_acao_limpar() {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'Sem permissão.', 'radar-loterico' ) );
	}
	check_admin_referer( 'radar_loterico_limpar' );
	radar_loterico_limpar_cache();
	set_transient( 'radar_loterico_teste_' . get_current_user_id(), 'ok:' . __( 'Cache limpo.', 'radar-loterico' ), 60 );
	wp_safe_redirect( admin_url( 'options-general.php?page=radar-loterico' ) );
	exit;
}

function radar_loterico_pagina() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$cfg   = radar_loterico_config();
	$teste = get_transient( 'radar_loterico_teste_' . get_current_user_id() );
	delete_transient( 'radar_loterico_teste_' . get_current_user_id() );
	?>
	<div class="wrap">
		<h1>Radar Lotérico</h1>
		<?php settings_errors( RADAR_LOTERICO_OPCAO ); ?>
		<?php if ( $teste ) : ?>
			<?php $ok = 0 === strpos( $teste, 'ok:' ); ?>
			<div class="notice <?php echo $ok ? 'notice-success' : 'notice-error'; ?> is-dismissible"><p><?php echo esc_html( substr( $teste, $ok ? 3 : 5 ) ); ?></p></div>
		<?php endif; ?>
		<p><?php esc_html_e( 'Ligue este site ao seu Radar Lotérico. A chave é criada no painel, em Equipe › Integração com o seu site.', 'radar-loterico' ); ?></p>
		<form method="post" action="options.php">
			<?php settings_fields( 'radar_loterico' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="radar-url"><?php esc_html_e( 'Endereço do sistema', 'radar-loterico' ); ?></label></th>
					<td><input id="radar-url" type="url" class="regular-text" name="<?php echo esc_attr( RADAR_LOTERICO_OPCAO ); ?>[url]" value="<?php echo esc_attr( $cfg['url'] ); ?>" placeholder="https://radar.nassatech.com.br" /></td>
				</tr>
				<tr>
					<th scope="row"><label for="radar-chave"><?php esc_html_e( 'Chave da API', 'radar-loterico' ); ?></label></th>
					<td>
						<input id="radar-chave" type="password" class="regular-text" autocomplete="off" name="<?php echo esc_attr( RADAR_LOTERICO_OPCAO ); ?>[chave]" value="" placeholder="<?php echo $cfg['chave'] ? esc_attr( substr( $cfg['chave'], 0, 6 ) . '… (salva)' ) : 'rl_…'; ?>" />
						<p class="description"><?php esc_html_e( 'Deixe em branco para manter a chave salva.', 'radar-loterico' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="radar-cache"><?php esc_html_e( 'Guardar as respostas por (minutos)', 'radar-loterico' ); ?></label></th>
					<td><input id="radar-cache" type="number" min="1" max="1440" name="<?php echo esc_attr( RADAR_LOTERICO_OPCAO ); ?>[cache_minutos]" value="<?php echo esc_attr( (string) $cfg['cache_minutos'] ); ?>" /></td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Certificado HTTPS', 'radar-loterico' ); ?></th>
					<td><label><input type="checkbox" name="<?php echo esc_attr( RADAR_LOTERICO_OPCAO ); ?>[verificar_ssl]" value="1" <?php checked( (int) $cfg['verificar_ssl'], 1 ); ?> /> <?php esc_html_e( 'Verificar o certificado (desligue só em teste)', 'radar-loterico' ); ?></label></td>
				</tr>
			</table>
			<?php submit_button( __( 'Salvar', 'radar-loterico' ) ); ?>
		</form>
		<p>
			<a class="button" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=radar_loterico_testar' ), 'radar_loterico_testar' ) ); ?>"><?php esc_html_e( 'Testar conexão', 'radar-loterico' ); ?></a>
			<a class="button" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=radar_loterico_limpar' ), 'radar_loterico_limpar' ) ); ?>"><?php esc_html_e( 'Limpar cache', 'radar-loterico' ); ?></a>
		</p>
		<h2><?php esc_html_e( 'Como usar', 'radar-loterico' ); ?></h2>
		<p><?php esc_html_e( 'Cole um destes códigos num bloco "Shortcode" de qualquer página:', 'radar-loterico' ); ?></p>
		<ul style="list-style:disc;padding-left:20px">
			<li><code>[radar_raio_x loterica="2894" semanas="4"]</code> <?php esc_html_e( 'Raio-X de Abertura de uma lotérica', 'radar-loterico' ); ?></li>
			<li><code>[radar_ranking uf="SP" cidade="São Paulo" limite="10"]</code> <?php esc_html_e( 'ranking da abertura (criterio: mais_aberturas, mais_rapida ou mais_pagina1)', 'radar-loterico' ); ?></li>
			<li><code>[radar_boloes loja="2894"]</code> <?php esc_html_e( 'bolões à venda da sua loja (modo="iframe" mostra o site público inteiro)', 'radar-loterico' ); ?></li>
			<li><code>[radar_painel texto="Entrar no painel"]</code> <?php esc_html_e( 'botão para o painel', 'radar-loterico' ); ?></li>
		</ul>
	</div>
	<?php
}
