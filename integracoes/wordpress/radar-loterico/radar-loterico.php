<?php
/**
 * Plugin Name:       Radar Lotérico
 * Description:       Mostra no seu site WordPress o Raio-X de Abertura, o ranking da abertura e os bolões da sua lotérica, lidos do sistema Radar Lotérico, e um botão para entrar no painel.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Radar Lotérico
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       radar-loterico
 *
 * Shortcodes:
 *   [radar_raio_x loterica="2894" semanas="4"]
 *   [radar_ranking uf="SP" cidade="" semanas="4" criterio="mais_aberturas" limite="10"]
 *   [radar_boloes loja="2894" modo="lista|iframe" altura="900"]
 *   [radar_painel texto="Entrar no painel"]
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'RADAR_LOTERICO_VERSAO', '1.0.0' );
define( 'RADAR_LOTERICO_DIR', plugin_dir_path( __FILE__ ) );
define( 'RADAR_LOTERICO_URL', plugin_dir_url( __FILE__ ) );

require_once RADAR_LOTERICO_DIR . 'includes/cliente.php';
require_once RADAR_LOTERICO_DIR . 'includes/configuracoes.php';
require_once RADAR_LOTERICO_DIR . 'includes/shortcodes.php';

add_action( 'wp_enqueue_scripts', 'radar_loterico_registrar_estilo' );
function radar_loterico_registrar_estilo() {
	wp_register_style( 'radar-loterico', RADAR_LOTERICO_URL . 'assets/radar-loterico.css', array(), RADAR_LOTERICO_VERSAO );
}

add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'radar_loterico_link_configuracoes' );
function radar_loterico_link_configuracoes( $links ) {
	array_unshift( $links, '<a href="' . esc_url( admin_url( 'options-general.php?page=radar-loterico' ) ) . '">' . esc_html__( 'Configurações', 'radar-loterico' ) . '</a>' );
	return $links;
}
