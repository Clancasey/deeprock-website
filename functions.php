<?php
// Disable WordPress admin bar
add_filter('show_admin_bar', '__return_false');

// Prevent WordPress from adding extra stuff to head
remove_action('wp_head', 'wp_generator');
remove_action('wp_head', 'wlwmanifest_link');
remove_action('wp_head', 'rsd_link');